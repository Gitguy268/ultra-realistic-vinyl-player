/**
 * The single-file build has no service worker: it is offline by construction. Its build
 * resolves `virtual:pwa-register` to this module, so the update toast simply never appears.
 */
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
