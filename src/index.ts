import CancellationError from "./util/CancellationError";

export { StratoApp } from "./app";
export { IChannelOptions, StratoChannel } from "./channel";
export { ChromecastDevice, IDeviceOpts } from "./device";
export {
    IChromecastService,
    DEFAULT_DISCOVERY_OPTS,
    IDiscoveryOptions,
    discover,
    findNamed,
} from "./discovery";
export {
    isJson,

    IMessage,
    MessageData,
    StratoSocket,
} from "./socket";

export * from "./util/protocol";
export { CancellationError };
