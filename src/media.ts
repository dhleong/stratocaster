import _debug from "debug";

import type { ChromecastDevice } from "./device";
import { IReceiveOpts, isJson } from "./socket";
import CancellationError from "./util/CancellationError";
import {
    GET_STATUS_PAYLOAD, IReceiverStatus, MEDIA_NS, RECEIVER_NS,
} from "./util/protocol";

const debug = _debug("stratocaster:media");

const RECEIVER_STATUS = "RECEIVER_STATUS";
const MEDIA_STATUS = "MEDIA_STATUS";

export async function* receiveMediaStatus(device: ChromecastDevice, opts: IReceiveOpts = {}) {
    const receiver = await device.channel(RECEIVER_NS, opts);
    const status = await receiver.send(GET_STATUS_PAYLOAD) as unknown as IReceiverStatus;

    let media = await device.channel(MEDIA_NS, {
        ...opts,
        destination: status.applications?.[0]?.transportId,
    });

    try {
        /* eslint-disable no-await-in-loop */
        while (opts.signal?.aborted !== true) {
            const message = await Promise.race([media.receiveOne(opts), receiver.receiveOne(opts)]);
            if (!isJson(message.data)) {
                continue;
            }

            if (message.data.type === RECEIVER_STATUS) {
                debug("Receiver status changed");
                const data = message.data as unknown as IReceiverStatus;
                media = await device.channel(MEDIA_NS, {
                    ...opts,
                    destination: data.applications?.[0]?.sessionId,
                });
                await media.write({ type: "GET_STATUS" });
            } else if (message.data.type === MEDIA_STATUS) {
                // TODO add type
                yield message.data;
            }
        }
    } catch (e) {
        if (!(e instanceof CancellationError)) {
            throw e;
        }
    }
}
