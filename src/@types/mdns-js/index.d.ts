/// <reference types="node" />

declare module "mdns-js" {
    // eslint-disable-next-line
    export interface ServiceType {}
    export interface Browser {
        discover(): void;
        stop(): void;

        on(event: "ready", cb: () => void): void;
        on(event: "update", cb: (event: BrowserUpdate) => void): void;
    }

    export interface BrowserUpdate {
        addresses?: string[];
        txt?: string[];
        port?: number;
        fullname?: string,
        host: string,
        interfaceIndex: number,
        networkInterface: string,
    }

    export function createBrowser(service: ServiceType): Browser;

    export function tcp(name: string): ServiceType;
}
