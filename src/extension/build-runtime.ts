import { iframeLoaderRuntime } from "../runtime/index";

await Bun.write(
  "extension/dist/review-runtime.js",
  `globalThis.__HTML_COLLAB_RUNTIME_SOURCE__ = ${JSON.stringify(iframeLoaderRuntime)};\n${iframeLoaderRuntime}\n`,
);
