import _debug from "debug";

import { StratoApp } from "./app";
import { performAuth } from "./auth";
import { IChannelOptions, StratoChannel } from "./channel";
import { discover, findNamed, IChromecastService } from "./discovery";
import { IReceiveOpts, StratoSocket } from "./socket";

import {
    APP_AVAILABLE,
    CONNECTION_NS,
    CONNECT_PAYLOAD,
    DEVICE_AUTH_NS,
    GET_STATUS_PAYLOAD,
    HEARTBEAT_NS,
    PING_PAYLOAD,
    RECEIVER_NS,

    IReceiverStatus,
} from "./util/protocol";
import { delay, throwCancellationIfAborted } from "./util/async";

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 5000;

const debug = _debug("stratocaster:device");

export interface IDeviceOpts {
    authenticate?: boolean;
    searchTimeout?: number;
}

export type IQueryOpts = IDeviceOpts & IReceiveOpts;

function acceptAny() {
    return true;
}

export class ChromecastDevice {
    public static async find(
        filter: (descriptor: IChromecastService) => boolean = acceptAny,
        options: IQueryOpts = {},
    ) {
        for await (const d of ChromecastDevice.discover(options)) {
            const descriptor = await d.getServiceDescriptor();
            if (!filter(descriptor)) continue;

            debug("found matching device!");
            return d;
        }

        throw new Error("Could not find a matching Chromecast");
    }

    public static async* discover(
        options: IQueryOpts = {},
    ) {
        for await (const info of discover({ ...options, timeout: options.searchTimeout })) {
            yield new ChromecastDevice(info.name, options, info);
        }
    }

    constructor(
        public readonly name: string,
        private readonly options: IDeviceOpts = {},
        private service?: IChromecastService,
        private socket?: StratoSocket,
    ) {}

    public async app(appId: string) {
        const availability = await this.getAppAvailability([appId]);
        if (!availability[appId]) {
            throw new Error(`Did not receive availability for ${appId}`);
        }
        if (availability[appId] !== APP_AVAILABLE) {
            throw new Error(`App ${appId} not available: ${availability[appId]}`);
        }

        return new StratoApp(
            appId,
            this.getStatus.bind(this),
            this.channel.bind(this),
        );
    }

    public async channel(namespace: string, opts: IChannelOptions & IReceiveOpts = {}) {
        const socket = await this.ensureConnected(opts);
        return new StratoChannel(socket, namespace, opts);
    }

    public async getAppAvailability(appIds: string[], opts: IReceiveOpts = {}) {
        const receiver = await this.channel(RECEIVER_NS);
        const { availability } = await receiver.send({
            type: "GET_APP_AVAILABILITY",
            appId: appIds,
        }, opts);
        return availability as Record<string, string>;
    }

    public async getServiceDescriptor(opts: IReceiveOpts = {}) {
        return this.service ?? findNamed(this.name, opts);
    }

    public async getStatus(opts: IReceiveOpts = {}) {
        const receiver = await this.channel(RECEIVER_NS, opts);
        const { status } = await receiver.send(GET_STATUS_PAYLOAD, opts);
        debug("got status=", JSON.stringify(status, null, 2));
        return status as unknown as IReceiverStatus;
    }

    public close() {
        const { socket } = this;
        this.socket = undefined;

        if (socket) socket.close();
    }

    protected async ensureConnected(opts: IReceiveOpts) {
        const existing = this.socket;
        if (existing && existing.isConnected) {
            return existing;
        }

        if (!this.service) {
            debug("locating device:", this.name);
            this.service = await findNamed(this.name, {
                ...opts,
                timeout: this.options.searchTimeout,
            });
        }

        debug("connecting device:", this.service);
        const socket = existing?.createNew() ?? new StratoSocket(this.service);
        await socket.open();
        this.socket = socket;

        debug("setting up connection...");
        await this.prepareConnection(socket, opts);

        return socket;
    }

    private async prepareConnection(s: StratoSocket, opts: IReceiveOpts) {
        // CONNECT to the device
        const receiver = new StratoChannel(s, CONNECTION_NS);
        await receiver.write(CONNECT_PAYLOAD);

        throwCancellationIfAborted(opts.signal);

        // handle heartbeat
        const heartbeat = new StratoChannel(s, HEARTBEAT_NS);
        const timeout = setInterval(() => {
            (async () => {
                const result = await Promise.race([
                    heartbeat.send(PING_PAYLOAD),
                    delay(HEARTBEAT_TIMEOUT),
                ]);

                debug("result=", result);
                if (!result) {
                    // timed out
                    debug("failed to receive heartbeat within deadline");
                    s.close();
                }
            })();
        }, HEARTBEAT_INTERVAL);
        s.on("closed", () => { clearTimeout(timeout); });

        // wait for the initial PONG
        debug("waiting for PONG");
        await heartbeat.receiveOne(opts);

        // auth: this step is optional
        if (this.options.authenticate) {
            const authChannel = new StratoChannel(s, DEVICE_AUTH_NS);
            await performAuth(authChannel, opts);
        }

        debug("connection set up!");
    }
}
