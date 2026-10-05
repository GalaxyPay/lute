/**
 * Channels for SyncSession. Today every channel is a Chrome runtime Port,
 * relayed by the background (src/ext/background/main.ts):
 *
 * - the lute.app page connects to the extension through externally_connectable,
 *   which only Chromium supports and which enforces the page's origin;
 * - extension pages (side panel, options) connect to the background.
 *
 * A Firefox build would need a different page-side channel (the content-script
 * relay in src/ext/contentScripts carries dApp requests the same way). It only
 * has to produce a SyncTransport; SyncSession does not change.
 *
 * Every browser.* reference lives inside a function only extension pages call,
 * because `browser` is only auto-imported in extension builds.
 */
import { SYNC_BROWSER_WINDOW, syncWindowBounds } from "@/ext/syncWindow";
import {
  SyncError,
  type SyncMessage,
  type SyncTransport,
} from "@/services/SyncSession";

interface PortLike {
  postMessage(msg: any): void;
  onMessage: {
    addListener(cb: (msg: any) => void): void;
    removeListener(cb: (msg: any) => void): void;
  };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

/**
 * A SyncTransport over a Port. Messages that arrive before a handler is
 * attached are kept, so nothing sent early is lost.
 */
export function portTransport(port: PortLike): SyncTransport {
  let handler: ((m: SyncMessage) => void) | undefined;
  let onClosed: (() => void) | undefined;
  const buffered: SyncMessage[] = [];
  let closed = false;
  port.onMessage.addListener((m: SyncMessage) => {
    if (handler) handler(m);
    else buffered.push(m);
  });
  port.onDisconnect.addListener(() => {
    closed = true;
    onClosed?.();
  });
  return {
    send(m) {
      if (!closed) port.postMessage(m);
    },
    onMessage(cb) {
      handler = cb;
      buffered.splice(0).forEach(cb);
    },
    onClose(cb) {
      if (closed) cb();
      else onClosed = cb;
    },
    close() {
      if (closed) return;
      closed = true;
      port.disconnect();
      // A Port does not report its own disconnect; the session still needs
      // to stop waiting.
      onClosed?.();
    },
  };
}

/** The extension id, which the content script tells lute.app pages only. */
export function extensionId() {
  return document.documentElement.dataset.luteExtensionId;
}

/**
 * The web app's side. Without a token the web app is sending and the
 * extension opens its side panel to receive. With one, the extension started
 * the sync and this page receives.
 */
export function webTransport(token?: string) {
  const id = extensionId();
  const runtime = (globalThis as any).chrome?.runtime;
  if (!id || !runtime?.connect)
    throw new SyncError("failed", "The Lute extension is not available.");
  const port: PortLike = runtime.connect(id, {
    name: token ? `lute-sync:${token}` : "lute-sync",
  });
  return portTransport(port);
}

/** The extension popup receiving a sync the web app started in tab `tabId`. */
export function receiverTransport(tabId: number) {
  return portTransport(
    browser.runtime.connect({ name: `lute-sync-receiver:${tabId}` }) as PortLike
  );
}

/**
 * An extension page starting a sync: get a one-time token from the background,
 * open the web app with it over this window, and wait for the page to connect
 * back. Returns `close` so the sender can close that window when done.
 *
 * The window is opened with window.open, as a popup: Chrome gives those a
 * read-only address bar, which shows the user this is the web app.
 * chrome.windows.create popups have none. If the popup is blocked, a small
 * normal window (with full browser controls) is used instead.
 */
export async function extensionSenderTransport(webOrigin: string) {
  const port = browser.runtime.connect({ name: "lute-sync-ext" }) as PortLike;
  const token = await new Promise<string>((resolve, reject) => {
    const listener = (m: any) => {
      port.onMessage.removeListener(listener);
      if (m?.t === "token" && typeof m.token === "string") resolve(m.token);
      else
        reject(
          new SyncError(m?.code ?? "failed", m?.message ?? "Sync failed.", true)
        );
    };
    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(() =>
      reject(new SyncError("closed", "The sync could not start.", true))
    );
  });
  const transport = portTransport(port);
  const url = `${webOrigin}/sync?${new URLSearchParams({ token })}`;
  const b = syncWindowBounds({
    left: window.screenX,
    top: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight,
  });
  const features = Object.entries(b)
    .map(([k, v]) => `${k}=${v}`)
    .concat("popup")
    .join(",");
  const popup = window.open(url, "lute-sync", features);
  if (popup) return { transport, close: () => popup.close() };
  const win = await browser.windows.create({
    url,
    type: "normal",
    focused: true,
    ...syncWindowBounds(await browser.windows.getCurrent(), SYNC_BROWSER_WINDOW),
  });
  return {
    transport,
    close: () => {
      if (win.id != null) browser.windows.remove(win.id).catch(() => {});
    },
  };
}
