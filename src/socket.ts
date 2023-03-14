import { EventEmitter } from "events";
import _debug from "debug";
import tls from "tls";

import { cast_channel as proto } from "./util/cast_channel";
import { CancellableAsyncSink } from "./util/async";
import { PONG_PAYLOAD } from "./util/protocol";

const debug = _debug("stratocaster:socket");

const DEFAULT_SOURCE = "source-0";
const DEFAULT_DESTINATION = "receiver-0";

export type MessageData = string | Buffer | Record<string, unknown>;

export interface IMessage {
    namespace: string;
    data: MessageData;

    source?: string;
    destination?: string;
}

export interface IReceiveOpts {
    signal?: AbortSignal;
}

export function isJson(data: MessageData): data is Record<string, unknown> {
    return !Buffer.isBuffer(data) && typeof data !== "string";
}

function parseData(message: proto.CastMessage): MessageData {
    if (message.payloadType === proto.CastMessage.PayloadType.BINARY) {
        return Buffer.from(message.payloadBinary);
    }

    try {
        const json = JSON.parse(message.payloadUtf8);
        return json;
    } catch (e) {
        return message.payloadUtf8;
    }
}

/**
 * Low-level communication with a Chromecast device
 */
export class StratoSocket extends EventEmitter {
    private conn: tls.TLSSocket | undefined;
    private disconnected = false;

    private pendingDataLength = 0;
    private pendingData: Buffer | undefined;

    private readonly receivers: CancellableAsyncSink<IMessage>[] = [];
    private lastId = 0;

    constructor(
        private readonly opts: {
            address: string,
            port: number,

            senderId?: string,
        },
    ) {
        super();
    }

    public get isConnected() {
        return this.conn && !this.disconnected;
    }

    public async open() {
        if (this.conn) {
            throw new Error("Socket can only be opened once");
        }

        const target = {
            host: this.opts.address,
            port: this.opts.port,
            rejectUnauthorized: false,
        };

        debug("connecting:", target);

        let isResolved = false;
        return new Promise<void>((resolve, reject) => {
            this.conn = tls.connect(target)
                .on("end", () => {
                    debug("disconnected from host");
                    this.onClosed();
                })
                .on("error", err => {
                    debug("connection error:", err);
                    this.onClosed(err);
                    if (!isResolved) {
                        reject(err);
                    }
                })
                .on("data", data => this.onDataReceived(data))
                .on("secureConnect", () => {
                    // TODO: extract this to an "app" or something
                    this.write({
                        namespace: "urn:x-cast:com.google.cast.tp.heartbeat",
                        data: { type: "PING" },
                    });
                    isResolved = true;
                    resolve();
                });
        });
    }

    public close() {
        if (!this.conn) {
            // never opened; nop
            return;
        }

        this.conn.end();
    }

    public nextId(): number {
        return ++this.lastId;
    }

    public receive({ signal }: IReceiveOpts = {}): AsyncIterable<IMessage> {
        let receiver: CancellableAsyncSink<IMessage>;
        const onCancel = () => {
            const idx = this.receivers.indexOf(receiver);
            if (idx !== -1) {
                this.receivers.splice(idx, 1);
            }
        };
        receiver = new CancellableAsyncSink<IMessage>(onCancel);

        this.receivers.push(receiver);

        signal?.addEventListener("abort", () => {
            onCancel();
            receiver.end();
        });

        return receiver;
    }

    public async write(message: IMessage) {
        const s = this.conn;
        if (!s) throw new Error("Not opened");

        const m = new proto.CastMessage();
        m.sourceId = message.source ?? this.opts.senderId ?? DEFAULT_SOURCE;
        m.destinationId = message.destination ?? DEFAULT_DESTINATION;
        m.namespace = message.namespace;
        m.protocolVersion = proto.CastMessage.ProtocolVersion.CASTV2_1_0;

        if (Buffer.isBuffer(message.data)) {
            m.payloadType = proto.CastMessage.PayloadType.BINARY;
            m.payloadBinary = message.data;
        } else {
            m.payloadType = proto.CastMessage.PayloadType.STRING;
            m.payloadUtf8 = typeof message.data === "string"
                ? message.data
                : JSON.stringify(message.data);
        }

        debug("sending:", m);

        const writer = proto.CastMessage.encode(m);
        const data = writer.finish();
        const header = Buffer.alloc(4);
        header.writeUInt32BE(data.length, 0);

        return new Promise((resolve, reject) => {
            s.write(Buffer.concat([header, data]), err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public createNew() {
        return new StratoSocket(this.opts);
    }

    private onClosed(error?: Error) {
        debug("closed; error=", error);
        this.emit("closed");

        this.disconnected = true;
        for (const receiver of this.receivers) {
            receiver.end(error);
        }
    }

    private onDataReceived(received: Buffer) {
        let data = received;
        if (!this.pendingDataLength) {
            const length = data.readUInt32BE();
            this.pendingDataLength = length;
            this.pendingData = undefined;
            if (data.length - 4 > 0) {
                data = data.slice(4);
            }
        }

        if (this.pendingData) {
            data = Buffer.concat([this.pendingData, data]);
            this.pendingData = undefined;
        }

        if (data.length < this.pendingDataLength) {
            // not ready yet
            this.pendingData = data;
            return;
        }

        // ready to consume!
        const messageData = data.slice(0, this.pendingDataLength);

        // clear state
        if (data.length > this.pendingDataLength) {
            this.pendingData = data.slice(this.pendingDataLength - 1);
            throw new Error("ackshually we need to read a length here");
        }
        this.pendingDataLength = 0;

        const message = proto.CastMessage.decode(messageData);
        this.onMessageReceived(message);
    }

    private onMessageReceived(message: proto.CastMessage) {
        // broadcast as our convenient Message type
        const parsed: IMessage = {
            source: message.sourceId,
            destination: message.destinationId,
            namespace: message.namespace,
            data: parseData(message),
        };

        debug("received: ", message);

        if (isJson(parsed.data) && parsed.data.type === "PING") {
            this.write({
                source: parsed.destination,
                destination: parsed.source,
                namespace: parsed.namespace,
                data: PONG_PAYLOAD,
            });
            return;
        }

        for (const receiver of this.receivers) {
            receiver.write(parsed);
        }
    }
}
