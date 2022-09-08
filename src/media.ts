import _debug from "debug";
import { StratoChannel } from "./channel";

import type { ChromecastDevice } from "./device";
import { IReceiveOpts, isJson } from "./socket";
import CancellationError from "./util/CancellationError";
import {
    GET_STATUS_PAYLOAD,
    IMediaStatus,
    IMediaStatuses,
    IReceiverStatus,
    MEDIA_NS,
    PlayerState,
    RECEIVER_NS,
} from "./util/protocol";

const debug = _debug("stratocaster:media");

const RECEIVER_STATUS = "RECEIVER_STATUS";
const MEDIA_STATUS = "MEDIA_STATUS";

const IDLE_MEDIA_STATUS: IMediaStatus = {
    mediaSessionId: 0,
    playbackRate: 1,
    playerState: PlayerState.IDLE,
    supportedMediaCommands: 0,
    volume: { level: 1, muted: false },
};

export async function* receiveMediaStatus(device: ChromecastDevice, opts: IReceiveOpts = {}) {
    const receiver = await device.channel(RECEIVER_NS, opts);
    const statusMessage = await receiver.send(GET_STATUS_PAYLOAD);
    let lastStatus = statusMessage.status as unknown as IReceiverStatus;
    let media: StratoChannel | undefined;
    let currentMediaStatus: IMediaStatus = IDLE_MEDIA_STATUS;

    yield currentMediaStatus;

    try {
        /* eslint-disable no-await-in-loop */
        while (opts.signal?.aborted !== true) {
            // If a new media app has started (or the last one was stopped) switch
            // to the new one. Note that if the app doesn't support the media NS then
            // this is sorta pointless, but it *does* simplify the type checks below.
            if (media == null) {
                const app = lastStatus.applications?.[0];
                const destination = app?.transportId;
                media = await device.channel(MEDIA_NS, {
                    ...opts,
                    destination,
                });

                // If media is indeed supported, request the initial state. This is
                // important as otherwise we don't get pushed updates!
                if (app?.namespaces?.find(({ name }) => name === MEDIA_NS)) {
                    debug("Observe media on transportId", destination);

                    const response = await media.send(GET_STATUS_PAYLOAD);
                    debug("initial media status=", response);

                    // *How* would we destructure this, eslint?
                    // eslint-disable-next-line prefer-destructuring
                    currentMediaStatus = (response.status as IMediaStatuses)[0];
                    yield currentMediaStatus;
                }
            }

            debug("await message...");
            const message = await Promise.race([
                media.receiveOne(opts),
                receiver.receiveOne(opts),
            ]);
            if (!isJson(message.data)) {
                continue;
            }

            if (message.data.type === RECEIVER_STATUS) {
                const nextStatus = message.data.status as unknown as IReceiverStatus;
                if (debug.enabled) {
                    debug("Receiver status changed", JSON.stringify(lastStatus, null, 2));
                }

                const app = nextStatus.applications?.[0];
                const destination = app?.transportId;

                if (destination !== lastStatus.applications?.[0]?.transportId) {
                    lastStatus = nextStatus;
                    media = undefined;
                    currentMediaStatus = IDLE_MEDIA_STATUS;
                    yield currentMediaStatus;
                    debug("Receiver transport changed changed");
                }
            } else if (message.data.type === MEDIA_STATUS) {
                // Pushed statuses are partials:
                if (debug.enabled) {
                    debug("Received media status", JSON.stringify(message.data, null, 2));
                }
                const statuses = message.data.status as IMediaStatuses;
                currentMediaStatus = { ...currentMediaStatus, ...statuses[0] };
                yield currentMediaStatus;
            }
        }
    } catch (e) {
        if (!(e instanceof CancellationError)) {
            throw e;
        }
    }
}
