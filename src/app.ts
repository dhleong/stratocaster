import _debug from "debug";

import { StratoChannel, IChannelOptions } from "./channel";
import { IReceiveOpts } from "./socket";
import { throwCancellationIfAborted } from "./util/async";
import { RECEIVER_NS, IReceiverStatus, IReceiverApp } from "./util/protocol";

const debug = _debug("stratocaster:app");

export class StratoApp {
    constructor(
        public readonly id: string,
        private readonly getStatus: () => Promise<IReceiverStatus>,
        private readonly channelImpl: (
            ns: string,
            opts?: IChannelOptions & IReceiveOpts,
        ) => Promise<StratoChannel>,
    ) {}

    public async launch(opts: IReceiveOpts = {}) {
        await this.channel("", opts);
    }

    public async channel(namespace: string, opts: IReceiveOpts = {}) {
        // figure out if we need to join or start the session
        const status = await this.getStatus();
        for (const app of status.applications) {
            if (app.appId === this.id) {
                debug("app", this.id, "already running");
                return this.channelFromApp(app, namespace, opts);
            }
        }

        throwCancellationIfAborted(opts.signal);

        // join
        debug("launching app:", this.id);
        const receiver = await this.channelImpl(RECEIVER_NS);
        const response = await receiver.send({
            type: "LAUNCH",
            appId: this.id,
        }, opts);

        if (response.type !== "RECEIVER_STATUS") {
            throw new Error(`Unexpected LAUNCH response: ${response.type}`);
        }

        const { applications } = response.status as IReceiverStatus;
        for (const app of applications) {
            if (app.appId === this.id) {
                debug("app launched!");
                return this.channelFromApp(app, namespace, opts);
            }
        }

        throw new Error(`Failed to launch app ${this.id}`);
    }

    private async channelFromApp(
        app: IReceiverApp,
        namespace: string,
        opts: IReceiveOpts,
    ) {
        return this.channelImpl(namespace, {
            ...opts,
            destination: app.transportId,
        });
    }
}
