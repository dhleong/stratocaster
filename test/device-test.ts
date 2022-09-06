import * as chai from "chai";
import { AsyncSink } from "ix/asynciterable/asyncsink";
import { SinonStub, stub } from "sinon";
import sinonChai from "sinon-chai";

import { ChromecastDevice } from "../src/device";
import { StratoSocket, IMessage } from "../src/socket";
import { IChromecastService } from "../src/discovery";
import { HEARTBEAT_NS } from "../src/util/protocol";

chai.should();
chai.use(sinonChai);

describe("ChromecastDevice", () => {
    let s: StratoSocket;
    let d: ChromecastDevice;
    let openStub: SinonStub<[], Promise<unknown>>;
    let createNewStub: SinonStub<[], StratoSocket>;
    const receiveSubject = new AsyncSink<IMessage>();

    // TODO there's got to be a better way...
    function enqueue(...messages: IMessage[]) {
        setTimeout(() => {
            for (const m of messages) {
                receiveSubject.write(m);
            }
        });
    }

    beforeEach(() => {
        const info: IChromecastService = {
            id: "",
            address: "",
            model: "testable",
            name: "serenity",
            port: 42,
        };

        // this could probably be simplified...
        s = new StratoSocket(info);
        openStub = stub(s, "open").resolves();
        createNewStub = stub(s, "createNew").returnsThis();
        stub(s, "receive")
            .returns(receiveSubject);

        stub(s, "close").callsFake(() => {
            s.emit("closed");
        });
        stub(s, "write").callsFake(async m => {
            if ((m.data as any).requestId) {
                // enqueue a "response"
                enqueue(m);
            }
        });
        d = new ChromecastDevice("serenity", {}, info, s);

        enqueue({
            namespace: HEARTBEAT_NS,
            data: { type: "PONG" },
        }, {
            namespace: HEARTBEAT_NS,
            data: { type: "PONG" },
        });
    });

    afterEach(() => {
        d.close();
    });

    it("opens socket lazily", async () => {
        createNewStub.should.not.be.called;
        openStub.should.not.be.called;

        await d.getStatus();

        openStub.should.be.calledOnce;
        createNewStub.should.have.been.calledOnce;
    });

    // TODO
    it.skip("reconnects when necessary");
});
