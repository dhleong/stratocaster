import * as chai from "chai";

import AbortController from "abort-controller";

import { IMessage, StratoSocket } from "../src/socket";
import { cast_channel as proto } from "../src/util/cast_channel";
import { HEARTBEAT_NS } from "../src/util/protocol";

chai.should();

describe("StratoSocket", () => {
    let socket: StratoSocket;
    let receiveMessage: (message: proto.ICastMessage) => void;

    beforeEach(() => {
        socket = new StratoSocket({ address: "127.0.0.1", port: 9001 });
        receiveMessage = message => setTimeout(() => {
            (socket as any).onMessageReceived(
                new proto.CastMessage(message),
            );
        });
    });

    describe("AbortSignal support", () => {
        let controller: AbortController;
        let state: { iterated: IMessage[], iterating: boolean };
        let iterating: () => Promise<void>;

        beforeEach(() => {
            controller = new AbortController();
            const { signal } = controller;
            state = { iterated: [], iterating: true };
            iterating = async () => {
                const iterable = socket.receive({ signal });
                for await (const message of iterable) {
                    state.iterated.push(message);
                    break;
                }
                state.iterating = false;
            };
        });

        it("stops an iterating receive()", async () => {
            const promise = iterating();
            state.iterating.should.be.true;

            // Signal abort
            controller.abort();

            // We should stop iterating immediately:
            await promise;
            state.iterating.should.be.false;
            state.iterated.should.be.empty;
        });

        it("does not iterate over received messages", async () => {
            const promise = iterating();
            state.iterating.should.be.true;

            // Signal abort
            controller.abort();
            receiveMessage({
                protocolVersion: proto.CastMessage.ProtocolVersion.CASTV2_1_0,
                sourceId: "",
                destinationId: "",
                payloadType: proto.CastMessage.PayloadType.STRING,
                namespace: HEARTBEAT_NS,
                payloadUtf8: JSON.stringify({ type: "TEST" }),
            });

            // We should stop iterating immediately:
            await promise;
            state.iterating.should.be.false;

            // We should also not receive the message:
            state.iterated.should.be.empty;
        });
    }).timeout("2s");
});
