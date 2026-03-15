import { sendMessage } from "webext-bridge/content-script";
import getAppName from "@/utils/getAppName";

(() => {
  // inject the script to access the full dom
  const element: HTMLElement = document.createElement("script");

  element.setAttribute("type", "text/javascript");
  element.setAttribute("src", browser.runtime.getURL("dist/assets/client.js"));

  // append the script to the end of the document head
  document.head.appendChild(element);

  window.addEventListener("lute-connect", messageHandler);

  function b64ToArr(b64: string) {
    return new Uint8Array(Buffer.from(b64, "base64"));
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
          browser.runtime.onMessage.addListener((message: any) => {
            window.dispatchEvent(
              new CustomEvent("connect-response", { detail: message })
            );
            resolve();
            return undefined;
          });
          break;
        }
        case "sign": {
          sendMessage(
            "sign-txns-request",
            { appName: getAppName() },
            "background"
          );
          browser.runtime.onMessage.addListener((message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: { action: e.detail.action, txns: e.detail.txns },
              });
            } else {
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
            }
            resolve();
            return undefined;
          });
          break;
        }
        case "data": {
          sendMessage(
            "sign-data-request",
            { domain: location.host },
            "background"
          );
          browser.runtime.onMessage.addListener((message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: {
                  action: e.detail.action,
                  data: e.detail.data,
                  metadata: e.detail.metadata,
                },
              });
            } else {
              window.dispatchEvent(
                new CustomEvent("sign-data-response", {
                  detail: {
                    ...message,
                    signerResponse: message.signerResponse
                      ? {
                          ...message.signerResponse,
                          signature: b64ToArr(message.signerResponse.signature),
                          signer: b64ToArr(message.signerResponse.signer),
                          authenticatorData: b64ToArr(
                            message.signerResponse.authenticatorData
                          ),
                        }
                      : undefined,
                  },
                })
              );
            }
            resolve();
            return undefined;
          });
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
          browser.runtime.onMessage.addListener((message: any) => {
            if (message.action === "ready") {
              browser.runtime.sendMessage({
                data: { action: e.detail.action, network: e.detail.network },
              });
            } else {
              window.dispatchEvent(
                new CustomEvent("add-network-response", { detail: message })
              );
            }
            resolve();
            return undefined;
          });
          break;
        }
      }
    });
  }
})();
