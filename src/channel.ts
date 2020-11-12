import { StratoSocket, MessageData } from "./socket";
import { PING_PAYLOAD } from "./util/protocol";

export interface IChannelOptions {
    destination?: string;
}

/**
 * High-level namespace-based Channel abstraction
 */
export class StratoChannel {
    constructor(
        private readonly socket: StratoSocket,
        public readonly namespace: string,
        private readonly options: IChannelOptions = {},
    ) { }

    public get isConnected() {
        return this.socket.isConnected;
    }

    public async send(message: Record<string, unknown>) {
        const toSend = {
            requestId: this.socket.nextId(),
            ...message,
        };

        await this.write(toSend);

        // TODO timeout
        for await (const m of this.socket.receive()) {
            if (Buffer.isBuffer(m.data) || typeof m.data === "string") {
                continue;
            }

            // special cases:
            if (message === PING_PAYLOAD && m.data.type === "PONG") {
                return m.data;
            }

            // otherwise...
            if (m.data.requestId === toSend.requestId) {
                return m.data;
            }
        }

        throw new Error("Did not receive response");
    }

    public async write(message: MessageData) {
        return this.socket.write({
            namespace: this.namespace,
            destination: this.options.destination,
            data: message,
        });
    }
}
