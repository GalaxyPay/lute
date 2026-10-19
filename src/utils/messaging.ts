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
  clearTimeout(silentTimer);
  dappLinkProblem.value = undefined;
  return true;
}

/**
 * Why a web-mode popup cannot complete its request, so the user is told
 * instead of being left with a dead page.
 * - "missing": there is no opener to reply to. Either the dapp sends
 *   `Cross-Origin-Opener-Policy: same-origin`, which severs the link to
 *   cross-origin popups, or the page was opened directly.
 * - "silent": the opener never sent a request after "ready".
 */
export type DappLinkProblem = "missing" | "silent";
export const dappLinkProblem = ref<DappLinkProblem>();

/** How long to wait for the dapp's request after "ready". */
export const DAPP_SILENT_MS = 10_000;
let silentTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Send the initial "ready" handshake to the opener. Nothing sensitive is in
 * it, and the dapp has not identified itself yet, so target the referrer's
 * origin when known and fall back to any origin.
 */
export function postReady(message: { action: string; debug: boolean }) {
  if (!window.opener) {
    dappLinkProblem.value = "missing";
    return;
  }
  window.opener.postMessage(message, referrerOrigin() ?? "*");
  clearTimeout(silentTimer);
  silentTimer = setTimeout(() => {
    if (!dappOrigin) dappLinkProblem.value = "silent";
  }, DAPP_SILENT_MS);
}

/**
 * Replies never use a wildcard target. If the origin is unknown (no request
 * yet and no referrer), the reply is dropped; lute-connect polls
 * `popup.closed`, so a dropped "close" still settles the dapp's request.
 */
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
  } else {
    console.error("[Lute] dropped reply: dapp origin unknown", message?.action);
  }
}
