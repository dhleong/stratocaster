stratocaster
============

*a totally tubular chromecast client*

## What?

stratocaster is a lightweight, Promise-based Chromecast "receiver"
library, providing abstractions at various levels to facilitate most use
cases. It does not include any tools for interacting with specific
Chromecast applications (see [babbling][babbling]) but instead is meant
to provide clean interfaces for implementing such interactions.

Here's how to use it:

```typescript
import { ChromecastDevice, MEDIA_NS } from "stratocaster";

// in most practical cases, you will want to speak to a specific device:
const d = new ChromecastDevice("Family Room TV");

// ... but you can also search for one if you like:
const d = await ChromecastDevice.find(info => {
    return info.model === "Chromecast Ultra";
});

// ... or step through every device you can find:
for await (const device of ChromecastDevice.discover()) {
    // ...
}

// once you've found a device, typically you'll want to work with
// a specific app on the device; this opens the "generic media receiver":
const app = await d.app("CC1AD845");

// the app is not necessarily opened on the device at this point;
// if that's all you want to do, or if you want to show the app early
// while performing other preparations before interacting with it,
// you can explicitly launch the app:
await app.launch();

// communications are silo'd into different "channels," identified with
// a string namespace. the media namespace is commonly used to play videos
const channel = await app.channel(MEDIA_NS);

// JSON-encoded messages can be conveniently sent to channels, and the
// response message will be returned
const response = await ch.send({
    type: "LOAD",
    media: {
      contentId: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      streamType: "BUFFERED",
    },
});

// don't forget to close the device when done! this will disconnect any
// active connection and invalidate all app and channel references
d.close();
```

## Why?

I've been using [nodecastor][nodecastor] for quite some time but finally
got tired of waiting for [mdns][mdns] to compile. I could perhaps have
switched to [node-castv2][node-castv2], but that also has a mix of
emitter and callback-style APIs that I would have to adapt, and I would
also have to maintain my own typescript typings for it.

stratocaster is implemented natively in Typescript, with only pure JS
dependencies (and as few of them as possible).

Also, I thought it'd be a fun project :)

## Credits

- [nodecastor][nodecastor] for their initial research
- [node-castv2][node-castv2] for their thorough protocol documentation

[babbling]: https://github.com/dhleong/babbling
[mdns]: https://www.npmjs.com/package/mdns
[nodecastor]: https://github.com/vincentbernat/nodecastor
[node-castv2]: https://github.com/thibauts/node-castv2
