export const DEVICE_AUTH_NS = "urn:x-cast:com.google.cast.tp.deviceauth";
export const CONNECTION_NS = "urn:x-cast:com.google.cast.tp.connection";
export const HEARTBEAT_NS = "urn:x-cast:com.google.cast.tp.heartbeat";
export const RECEIVER_NS = "urn:x-cast:com.google.cast.receiver";
export const MEDIA_NS = "urn:x-cast:com.google.cast.media";

export const CONNECT_PAYLOAD = { type: "CONNECT" };
export const PING_PAYLOAD = { type: "PING" };
export const PONG_PAYLOAD = { type: "PONG" };
export const GET_STATUS_PAYLOAD = { type: "GET_STATUS" };

export const APP_AVAILABLE = "APP_AVAILABLE";

export interface IReceiverApp {
    appId: string;
    displayName: string;
    iconUrl: string;
    isIdleScreen: boolean;
    launchedFromCloud: boolean;
    namespaces: Array<{ name: string }>;
    sessionId: string;
    statusText: string;
    transportId: string;
}

export interface IReceiverStatus {
    applications: IReceiverApp[];
    userEq: unknown,
    volume: {
        controlType: "attenuation",
        level: number,
        muted: boolean,
        stepInterval: number,
    }
}
