/**
 * Adds the worklet module. In the single-file build its URL is a `data:` URL: Chromium and
 * WebKit accept that from `file://`, where they refuse a Blob URL, and Firefox prefers the Blob.
 * So a `data:` URL is tried as a Blob first and as itself second (html-1's technique).
 */
export async function loadWorklet(ctx: BaseAudioContext, url: string): Promise<void> {
  if (!url.startsWith('data:')) {
    await ctx.audioWorklet.addModule(url);
    return;
  }
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  const body = url.slice(comma + 1);
  const source = header.endsWith(';base64') ? atob(body) : decodeURIComponent(body);
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } catch {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
