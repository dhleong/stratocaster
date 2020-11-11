import { StratoChannel } from "./channel";
import { findNamed, IChromecastService } from "./discovery";
import { StratoSocket } from "./socket";

import { CONNECT_PAYLOAD, CONNECTION_NS } from "./util/protocol";

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
        if (socket) socket.close();
    }

    private async ensureConnected() {
        const existing = this.socket;
        if (existing && existing.isConnected) {
            return existing;
        }

        if (!this.service) {
            this.service = await findNamed(this.name);
        }

        const socket = new StratoSocket(this.service);
        await socket.open();
        this.socket = socket;

        const receiver = new StratoChannel(socket, CONNECTION_NS);
        receiver.send(CONNECT_PAYLOAD);

        return socket;
    }
}
