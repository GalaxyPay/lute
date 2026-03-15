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

browser.runtime.onConnect.addListener(function (port) {
  if (port.name === "luteSidepanel") {
    port.onDisconnect.addListener(async () => {
      sp.setOptions({ path: BASE_PATH });
    });
  }
});

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
