import { syncOrigins } from "@/ext/syncOrigins";
import { createSyncRelay, type RelayPort } from "@/ext/syncRelay";
import { syncWindowBounds } from "@/ext/syncWindow";
import { onMessage } from "webext-bridge/background";
import type { DeclarativeNetRequest } from "webextension-polyfill";

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  // load latest content script
  import("./contentScriptHMR");
}

// @ts-expect-error missing types
const sp = browser.sidePanel;
const BASE_PATH = "dist/main/index.html";

sp.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) =>
  console.error(error)
);

const UNLOCK_KEY = "unlock";
const UNLOCK_ALARM = "lute-lock";

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== UNLOCK_ALARM) return;
  await browser.storage.session.remove(UNLOCK_KEY);
});

/*
 * Where the extension receives a sync the web app sends. The side panel sits
 * beside the web app, so it is preferred, but Chrome only opens it in
 * response to a user action. The web app asks for it through the content
 * script straight after its password is submitted ("sync-panel-request"),
 * the same route dApp sign requests take. The relay's own connection carries
 * no user action, so when the panel did not open it falls back to a popup.
 */
const panelAttempts = new Map<number, Promise<boolean>>();

onMessage("sync-panel-request", (message) => {
  const tabId = message.sender.tabId;
  const path = `${buildUrl("sync", "Lute", tabId)}&panel=1`;
  sp.setOptions({ path });
  // Called straight away, not after an await, so the user action still counts.
  const attempt: Promise<boolean> = sp.open({ tabId }).then(
    () => true,
    () => {
      // Leave the panel showing the wallet next time, not a dead sync page.
      sp.setOptions({ path: BASE_PATH });
      return false;
    }
  );
  panelAttempts.set(tabId, attempt);
  setTimeout(() => {
    if (panelAttempts.get(tabId) === attempt) panelAttempts.delete(tabId);
  }, 10_000);
});

/**
 * Whether the side panel opened for this tab's sync. The panel request and
 * the sync connection can arrive in either order, so wait briefly for it.
 */
async function panelOpened(tabId: number, waitMs = 1500) {
  const deadline = Date.now() + waitMs;
  while (!panelAttempts.has(tabId) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  const attempt = panelAttempts.get(tabId);
  if (!attempt) return false;
  panelAttempts.delete(tabId);
  return await attempt;
}

const syncRelay = createSyncRelay({
  origins: syncOrigins(import.meta.env.DEV),
  async openReceiver(tabId) {
    // The panel page connects as the receiver by itself.
    if (await panelOpened(tabId)) return;
    // Otherwise a popup over the web app's window, so both stay in view.
    const url = browser.runtime.getURL(buildUrl("sync", "Lute", tabId));
    let over;
    try {
      const tab = await browser.tabs.get(tabId);
      over = await browser.windows.get(tab.windowId!);
    } catch {
      // Position is a nicety; open it anyway.
    }
    await browser.windows.create({
      url,
      type: "popup",
      focused: true,
      ...syncWindowBounds(over),
    });
  },
});

browser.runtime.onConnect.addListener(function (port) {
  if (port.name === "luteSidepanel") {
    port.onDisconnect.addListener(async () => {
      sp.setOptions({ path: BASE_PATH });
    });
  } else {
    syncRelay.internal(port as RelayPort);
  }
});

browser.runtime.onConnectExternal.addListener((port) =>
  syncRelay.external(port as RelayPort)
);

function buildUrl(action: string, name: string, tabId: number) {
  const params = new URLSearchParams({ action, name, tabId: tabId.toString() });
  return `${BASE_PATH}?${params.toString()}`;
}

function openSidePanel(path: string, tabId: number) {
  sp.setOptions({ path }).then(sp.open({ tabId }));
}

onMessage("connect-request", (message) => {
  const paramsObj = {
    action: "connect",
    genesisID: message.data.genesisID,
    name: message.data.appName,
    tabId: message.sender.tabId.toString(),
  };
  const params = new URLSearchParams(paramsObj);
  const path = `${BASE_PATH}?${params.toString()}`;
  openSidePanel(path, message.sender.tabId);
});

onMessage("sign-txns-request", async (message) => {
  const path = buildUrl("sign", message.data.appName, message.sender.tabId);
  openSidePanel(path, message.sender.tabId);
});

onMessage("sign-data-request", async (message) => {
  const path = buildUrl("auth", message.data.domain, message.sender.tabId);
  openSidePanel(path, message.sender.tabId);
});

onMessage("swap-request", async (message) => {
  const paramsObj = {
    action: "swap",
    tx1: message.data.tx1,
    tx2: message.data.tx2,
  };
  const params = new URLSearchParams(paramsObj);
  const path = `${BASE_PATH}?${params.toString()}`;
  openSidePanel(path, message.sender.tabId);
});

onMessage("add-network-request", async (message) => {
  const path = buildUrl("network", message.data.appName, message.sender.tabId);
  openSidePanel(path, message.sender.tabId);
});

// set referrer on algonode/nodely requests
browser.runtime.onInstalled.addListener(async () => {
  const rules: DeclarativeNetRequest.Rule[] = [
    {
      id: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "Referer",
            operation: "set",
            value: "https://lute.app/",
          },
        ],
      },
      condition: {
        initiatorDomains: [browser.runtime.id],
        resourceTypes: ["image", "media", "xmlhttprequest"],
        requestDomains: ["ipfs.algonode.dev", "4160.nodely.io"],
      },
    },
  ];
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map((r) => r.id),
    addRules: rules,
  });
});
