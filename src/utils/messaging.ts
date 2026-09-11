/**
 * Replies to the dapp that requested a connect, sign, or add-network action.
 *
 * Extension mode routes replies through the requesting tab. Web (PWA) mode
 * talks to the opener window over postMessage: the dapp's origin is never
 * trusted from anything it controls (window.name, query params); it is pinned
 * from `event.origin` on the first request that arrives from `window.opener`,
 * and every reply is then targeted at exactly that origin so a navigated or
 * hijacked opener cannot read it.
 */

export const BASE_PATH = "dist/main/index.html";
export async function resetSidePanel() {
  // @ts-expect-error missing types
  await browser.sidePanel.setOptions({ path: BASE_PATH });
}

let dappOrigin: string | undefined;

/** Origin of the page that opened this popup, per the referrer header. */
export function referrerOrigin(): string | undefined {
  try {
    return document.referrer ? new URL(document.referrer).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Accept an inbound web-mode message only if it comes from the window that
 * opened this popup. The first accepted message pins the dapp origin; later
 * messages from any other origin (e.g. after the opener navigated) are dropped.
 */
export function isFromOpener(event: MessageEvent): boolean {
  if (!window.opener || event.source !== window.opener) return false;
  if (!event.origin || event.origin === "null") return false;
  if (dappOrigin) return event.origin === dappOrigin;
  dappOrigin = event.origin;
  return true;
}

/**
 * Send the initial "ready" handshake to the opener. Nothing sensitive is in
 * it, and the dapp has not identified itself yet, so target the referrer's
 * origin when known and fall back to any origin.
 */
export function postReady(message: { action: string; debug: boolean }) {
  window.opener?.postMessage(message, referrerOrigin() ?? "*");
}

/** Actions that carry no user data and may go out before the origin is pinned. */
const HARMLESS_ACTIONS = ["ready", "close", "error"];

export function sendOrPostMessage(message: any, tabId?: number) {
  if (tabId) {
    browser.tabs.sendMessage(tabId, message, { frameId: 0 });
    resetSidePanel();
    return;
  }
  if (!window.opener) return;
  const target = dappOrigin ?? referrerOrigin();
  if (target) {
    window.opener.postMessage(message, target);
  } else if (HARMLESS_ACTIONS.includes(message?.action)) {
    window.opener.postMessage(message, "*");
  } else {
    console.error("[Lute] dropped reply: dapp origin unknown", message?.action);
  }
}
