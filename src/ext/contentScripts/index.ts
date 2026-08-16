import { sendMessage } from "webext-bridge/content-script";
import getAppName from "@/utils/getAppName";
import { signDataResponseUnsafe, signDataSafe } from "@/utils/signData";

(() => {
  // inject the script to access the full dom
  const element: HTMLElement = document.createElement("script");

  element.setAttribute("type", "text/javascript");
  element.setAttribute("src", browser.runtime.getURL("dist/assets/client.js"));

  // append the script to the end of the document head
  document.head.appendChild(element);

  window.addEventListener("lute-connect", messageHandler);

  function b64ToArr(b64: string) {
    return Uint8Array.fromBase64(b64);
  }

  function messageHandler(e: any) {
    return new Promise<void>((resolve) => {
      switch (e.detail.action) {
        case "connect": {
          sendMessage(
            "connect-request",
            {
              appName: getAppName(),
              genesisID: e.detail.genesisID,
            },
            "background"
          );
          const listener = (message: any) => {
            browser.runtime.onMessage.removeListener(listener);
            window.dispatchEvent(
              new CustomEvent("connect-response", { detail: message })
            );
            resolve();
            return undefined;
          };
          browser.runtime.onMessage.addListener(listener);
          break;
        }
        case "sign": {
          sendMessage(
            "sign-txns-request",
            { appName: getAppName() },
            "background"
          );
          const listener = (message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: { action: e.detail.action, txns: e.detail.txns },
              });
            } else {
              browser.runtime.onMessage.removeListener(listener);
              window.dispatchEvent(
                new CustomEvent("sign-txns-response", {
                  detail: {
                    ...message,
                    txns: message.txns?.map((txn: string) =>
                      txn ? b64ToArr(txn) : null
                    ),
                  },
                })
              );
              resolve();
            }
            return undefined;
          };
          browser.runtime.onMessage.addListener(listener);
          break;
        }
        case "data": {
          sendMessage(
            "sign-data-request",
            { domain: location.host },
            "background"
          );
          const listener = (message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: {
                  action: e.detail.action,
                  data: e.detail.data,
                  stdSignData: e.detail.stdSignData
                    ? signDataSafe(e.detail.stdSignData)
                    : undefined,
                  metadata: e.detail.metadata,
                },
              });
            } else {
              browser.runtime.onMessage.removeListener(listener);
              window.dispatchEvent(
                new CustomEvent("sign-data-response", {
                  detail: {
                    ...message,
                    signerResponse: message.signerResponse
                      ? signDataResponseUnsafe(message.signerResponse)
                      : undefined,
                  },
                })
              );
              resolve();
            }
            return undefined;
          };
          browser.runtime.onMessage.addListener(listener);
          break;
        }
        case "swap": {
          sendMessage(
            "swap-request",
            {
              tx1: e.detail.tx1,
              tx2: e.detail.tx2,
            },
            "background"
          );
          break;
        }
        case "network": {
          sendMessage(
            "add-network-request",
            { appName: getAppName() },
            "background"
          );
          const listener = (message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: { action: e.detail.action, network: e.detail.network },
              });
            } else {
              browser.runtime.onMessage.removeListener(listener);
              window.dispatchEvent(
                new CustomEvent("add-network-response", { detail: message })
              );
              resolve();
            }
            return undefined;
          };
          browser.runtime.onMessage.addListener(listener);
          break;
        }
      }
    });
  }
})();
