/**
 * SyncSession channels are runtime Ports relayed by the background. The
 * lute.app page connects via externally_connectable, which enforces its origin.
 *
 * browser.* is referenced only inside functions extension pages call, because
 * `browser` is only auto-imported in extension builds.
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

/** Buffers messages that arrive before a handler is attached. */
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
 * Without a token the web app sends and the extension opens its side panel to
 * receive; with one, the extension started the sync and this page receives.
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
 * Uses a window.open popup because Chrome gives those a read-only address bar
 * showing the user this is the web app; chrome.windows.create popups have
 * none. A blocked popup falls back to a small normal window.
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
