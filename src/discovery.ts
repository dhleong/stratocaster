import _debug from "debug";
import mdns from "mdns-js";
import { IReceiveOpts } from "./socket";

import { CancellableAsyncSink, throwCancellationIfAborted } from "./util/async";

const debug = _debug("stratocaster:discovery");

export interface IChromecastService {
    address: string;
    id: string;
    model: string;
    name: string;
    port: number;
}

export interface IDiscoveryOptions extends IReceiveOpts {
    /**
     * How long to search, in milliseconds; defaults to 30s.
     * Set to `0` to search forever.
     */
    timeout?: number;
}

export const DEFAULT_DISCOVERY_OPTS: IDiscoveryOptions = {
    timeout: 30000,
};

function parseService(
    update: mdns.BrowserUpdate,
): IChromecastService | undefined {
    if (
        !update.addresses
        || !update.addresses.length
        || !update.fullname
        || !update.port
        || !update.txt
        || !update.txt.length
    ) {
        debug("received candidate with insufficient info:", update);
        return;
    }

    let id: string | undefined;
    let model: string | undefined;
    let name: string | undefined;

    for (const line of update.txt) {
        if (!id && line.startsWith("id=")) {
            id = line.substr(3);
        } else if (!model && line.startsWith("md=")) {
            model = line.substr(3);
        } else if (!name && line.startsWith("fn=")) {
            name = line.substr(3);
        }

        if (id && name) break;
    }

    if (!(id && name && model)) {
        debug("candidate missing friendlyName, ID, or model:", update);
        return;
    }

    debug("parsed", update);

    return {
        address: update.addresses[0],
        id,
        model,
        name,
        port: update.port,
    };
}

export function discover(
    options: IDiscoveryOptions = DEFAULT_DISCOVERY_OPTS,
): AsyncIterable<IChromecastService> {
    const opts = {
        DEFAULT_DISCOVERY_OPTS,
        ...options,
    };

    const browser = mdns.createBrowser(mdns.tcp("googlecast"));
    let timeout: NodeJS.Timeout | undefined;
    const stopDiscovery = () => {
        browser.stop();

        if (timeout) {
            clearTimeout(timeout);
        }
    };

    const sink = new CancellableAsyncSink<IChromecastService>(stopDiscovery);
    const seenIds = new Set<string>();

    browser.on("ready", () => {
        debug("starting discovery...");
        browser.discover();
    });

    browser.on("update", update => {
        const service = parseService(update);
        if (service && !seenIds.has(service.id)) {
            debug("discovered: ", service);
            seenIds.add(service.id);
            sink.write(service);
        }
    });

    if (opts.timeout) {
        timeout = setTimeout(() => {
            stopDiscovery();
            sink.end();
        }, opts.timeout);
    }

    opts.signal?.addEventListener("abort", () => {
        stopDiscovery();
        sink.end();
    });

    return sink;
}

export async function findNamed(
    name: string,
    options: IDiscoveryOptions = DEFAULT_DISCOVERY_OPTS,
) {
    for await (const candidate of discover(options)) {
        if (candidate.name === name) {
            return candidate;
        }
    }

    throwCancellationIfAborted(options.signal);

    throw new Error(`Could not find ${name}`);
}
