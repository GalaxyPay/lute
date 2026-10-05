// Web origins allowed to sync with the extension. Shared by the manifest
// (externally_connectable), the background (which checks every port's origin)
// and the content script (which tells only these pages the extension id).

export const SYNC_WEB_ORIGIN = "https://lute.app";

// `pnpm dev` serves the web app here (vite.config.ts server.port).
export const SYNC_DEV_ORIGIN = "http://localhost:3031";

export function syncOrigins(dev: boolean) {
  return dev ? [SYNC_WEB_ORIGIN, SYNC_DEV_ORIGIN] : [SYNC_WEB_ORIGIN];
}

/** Where the extension sends a sync it starts. */
export function syncWebOrigin(dev: boolean) {
  return dev ? SYNC_DEV_ORIGIN : SYNC_WEB_ORIGIN;
}
