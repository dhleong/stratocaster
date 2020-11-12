import _debug from "debug";

import { StratoChannel, IChannelOptions } from "./channel";
import { RECEIVER_NS, IReceiverStatus, IReceiverApp } from "./util/protocol";

const debug = _debug("stratocaster:app");

export class StratoApp {
    constructor(
        public readonly id: string,
        private readonly getStatus: () => Promise<IReceiverStatus>,
        private readonly channelImpl: (
            ns: string,
            opts?: IChannelOptions,
        ) => Promise<StratoChannel>,
    ) {}

    public async launch() {
        await this.channel("");
    }

    public async channel(namespace: string) {
        // figure out if we need to join or start the session
        const status = await this.getStatus();
        for (const app of status.applications) {
            if (app.appId === this.id) {
                debug("app", this.id, "already running");
                return this.channelFromApp(app, namespace);
            }
        }

        // join
        debug("launching app:", this.id);
        const receiver = await this.channelImpl(RECEIVER_NS);
        const response = await receiver.send({
            type: "LAUNCH",
            appId: this.id,
        });

        if (response.type !== "RECEIVER_STATUS") {
            throw new Error(`Unexpected LAUNCH response: ${response.type}`);
        }

        const { applications } = response.status as IReceiverStatus;
        for (const app of applications) {
            if (app.appId === this.id) {
                debug("app launched!");
                return this.channelFromApp(app, namespace);
            }
        }

        throw new Error(`Failed to launch app ${this.id}`);
    }

    private async channelFromApp(
        app: IReceiverApp,
        namespace: string,
    ) {
        return this.channelImpl(namespace, {
            destination: app.transportId,
        });
    }
}
