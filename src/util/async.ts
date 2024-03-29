import { AsyncSink } from "ix/asynciterable/asyncsink";
import CancellationError from "./CancellationError";

export function delay(millis: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, millis);
    });
}

export function throwCancellationIfAborted(signal?: AbortSignal) {
    if (signal?.aborted === true) {
        throw new CancellationError();
    }
}

/**
 * Drop-in replacement for AsyncSink that also handles early cancellation,
 * calling the method passed in the constructor
 */
export class CancellableAsyncSink<T> implements AsyncIterator<T>, AsyncIterable<T> {
    private readonly sink = new AsyncSink<T>();

    constructor(
        private readonly onCancel: () => void,
    ) {}

    public end(error?: Error) {
        if (error) this.sink.error(error);
        else this.sink.end();
    }

    public next() {
        return this.sink.next();
    }

    public async return(value: T) {
        this.onCancel();
        return {
            value,
            done: true,
        };
    }

    public write(value: T) {
        this.sink.write(value);
    }

    public [Symbol.asyncIterator]() {
        return this;
    }
}
