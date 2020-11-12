import _debug from "debug";

import { StratoChannel } from "./channel";
import { findNamed, IChromecastService } from "./discovery";
import { StratoSocket } from "./socket";

import {
    CONNECT_PAYLOAD,
    CONNECTION_NS,
    HEARTBEAT_NS,
    PING_PAYLOAD,
} from "./util/protocol";
import { delay } from "./util/async";

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 5000;

const debug = _debug("stratocaster:device");

export class ChromecastDevice {
    constructor(
        private readonly name: string,
        private service?: IChromecastService,
        private socket?: StratoSocket,
    ) {}

    public async channel(namespace: string) {
        const socket = await this.ensureConnected();
        return new StratoChannel(socket, namespace);
    }

    public close() {
        const { socket } = this;
        this.socket = undefined;

        if (socket) socket.close();
    }

    private async ensureConnected() {
        const existing = this.socket;
        if (existing && existing.isConnected) {
            return existing;
        }

        if (!this.service) {
            debug("locating device:", this.name);
            this.service = await findNamed(this.name);
        }

        debug("connecting device:", this.service);
        const socket = new StratoSocket(this.service);
        await socket.open();
        this.socket = socket;

        debug("setting up connection...");
        await ChromecastDevice.prepareConnection(socket);

        return socket;
    }

    private static async prepareConnection(s: StratoSocket) {
        const receiver = new StratoChannel(s, CONNECTION_NS);
        await receiver.send(CONNECT_PAYLOAD);

        // handle heartbeat
        const heartbeat = new StratoChannel(s, HEARTBEAT_NS);
        const timeout = setInterval(() => {
            (async () => {
                const result = await Promise.race([
                    heartbeat.send(PING_PAYLOAD),
                    delay(HEARTBEAT_TIMEOUT),
                ]);

                if (!result) {
                    // timed out
                    debug("failed to receive heartbeat within deadline");
                    s.close();
                }
            })();
        }, HEARTBEAT_INTERVAL);
        s.on("closed", () => { clearTimeout(timeout); });
    }
}
