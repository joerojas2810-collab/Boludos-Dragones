// Warms the browser with sprite sheets so an attack never waits for a download or a decode.
// Images are pinned in a module-level set: an unreferenced Image can be dropped from memory.
const pinned = new Map<string, HTMLImageElement>();

export function preloadImages(urls: readonly string[]): void {
  if (typeof Image === "undefined") return;
  for (const url of urls) {
    if (pinned.has(url)) continue;
    const im = new Image();
    im.decoding = "async";
    im.src = url;
    pinned.set(url, im);
    // decode() makes the first paint of the sheet instant; failures are harmless (it still loads).
    void im.decode?.().catch(() => undefined);
  }
}
