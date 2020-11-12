import _debug from "debug";

import { StratoChannel } from "./channel";

import { cast_channel as proto } from "./util/cast_channel";

const debug = _debug("stratocaster:auth");

export async function performAuth(channel: StratoChannel) {
    debug("sending auth challenge");
    const authMessage = new proto.DeviceAuthMessage({
        challenge: {},
    });
    channel.write(Buffer.from(
        proto.DeviceAuthMessage.encode(authMessage).finish(),
    ));

    const { data } = await channel.receiveOne();
    debug("auth response raw data:", data);

    if (!Buffer.isBuffer(data)) {
        throw new Error("Expected Buffer data for auth response");
    }

    const message = proto.DeviceAuthMessage.decode(data);
    debug("auth response decoded:", message);

    if (message.error) {
        throw new Error(`Auth error: ${message.error}`);
    }

    const { response } = message;
    debug("Auth response received:", response);

    // TODO actually verify? @thibaults has some ideas:
    // https://github.com/thibauts/node-castv2/issues/2
}
