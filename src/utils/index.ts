import { set } from "@/dbLute";
import algosdk from "algosdk";

export { getAssetInfo } from "./assetInfo";
export { refresh } from "./refresh";
export { resolveProtocol } from "./resolveProtocol";
export { send } from "./send";

export function formatAddr(addr: string | undefined) {
  if (!addr) return "";
  return `${addr?.substring(0, 6)}...${addr?.substring(52)}`;
}

export async function fetchAsync(url: string) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch {
    // console.error(err)
  }
}

export function decodeField(
  val: Uint8Array,
  enc: BufferEncoding | undefined = undefined
) {
  return Buffer.from(val).toString(enc);
}

export async function storeKey(acct: algosdk.Account) {
  const b64prefix = "MC4CAQAwBQYDK2VwBCIEIA==";
  const pkcs8Prefix = Buffer.from(b64prefix, "base64");
  const pkcs8 = new Uint8Array([...pkcs8Prefix, ...acct.sk.slice(0, 32)]);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  await set("keys", acct.addr.toString(), key);
}

export function ipfs2http(url: string) {
  const ipfsGateway = "https://ipfs.algonode.dev/ipfs/";
  return url.replace("ipfs://", ipfsGateway);
}

export function stringToBigint(amt: string, dec: number) {
  const [stringIntPart, paddedDecimalPart] = amt.split(".");
  const intPart = BigInt(stringIntPart || "0") * 10n ** BigInt(dec);
  const decimalPart = BigInt(
    paddedDecimalPart
      ? paddedDecimalPart.padEnd(dec, "0").substring(0, dec)
      : "0"
  );
  return intPart + decimalPart;
}

export function bigintToString(
  amt: bigint,
  dec: number,
  plain = false,
  round: number | undefined = undefined
): string {
  if (dec < 0 || dec > 19) throw Error("Invalid Decimals");
  let intPart = amt / 10n ** BigInt(dec);
  let decimalPart = amt % 10n ** BigInt(dec);
  if (round && round < dec) {
    const factor = 10 ** (dec - round);
    decimalPart = BigInt(Math.round(Number(decimalPart) / factor) * factor);
    if (decimalPart === 10n ** BigInt(dec)) {
      intPart += 1n;
      decimalPart = 0n;
    }
  }
  const stringIntPart = plain ? intPart.toString() : intPart.toLocaleString();
  const paddedDecimalPart = decimalPart
    .toString()
    .padStart(dec, "0")
    .replace(/0+$/, "");
  if (!decimalPart) return stringIntPart;
  else {
    const n = 1.1;
    const decimalSeparator = n.toLocaleString().substring(1, 2);
    return stringIntPart + decimalSeparator + paddedDecimalPart;
  }
}

export async function setIcon(name: string) {
  const gold = name === "gold" ? "-gold" : "";
  const store = useAppStore();
  if (store.isWeb) {
    const fav = document.querySelector("link[rel='icon']");
    //@ts-expect-error
    fav!.href = `favicon${gold}.ico`;
  } else {
    const fav = document.querySelector("link[rel='icon']");
    //@ts-expect-error
    fav!.href = `/assets/icon${gold}-16.png`;
    browser.action.setIcon({
      path: {
        16: `/assets/icon${gold}-16.png`,
        32: `/assets/icon${gold}-32.png`,
        48: `/assets/icon${gold}-48.png`,
        128: `/assets/icon${gold}-128.png`,
      },
    });
  }
}

export async function selectDevice() {
  const store = useAppStore();
  return new Promise<HIDDevice & USBDevice>((resolve, reject) => {
    const unsubscribe = store.$onAction(({ name, after, onError }) => {
      if (name !== "selectDevice") return;
      after((result) => {
        resolve(result);
        unsubscribe();
      });
      onError((error) => {
        reject(error);
        unsubscribe();
      });
    });
  });
}

export function deepClone(value: any): any {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  return Object.keys(value).reduce((acc: any, key) => {
    acc[key] = deepClone(value[key]);
    return acc;
  }, {});
}

export function b64url(b64: string) {
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export const BASE_PATH = "dist/main/index.html";
export async function resetSidePanel() {
  // @ts-expect-error missing types
  await browser.sidePanel.setOptions({ path: BASE_PATH });
}

export function expireDays(timeExpires: string | undefined) {
  if (!timeExpires) return undefined;
  const currTime = new Date().getTime();
  const expTime = new Date(timeExpires).getTime();
  return Math.round((expTime - currTime) / (1000 * 60 * 60 * 24));
}

export async function whenLoaded(promise: () => Promise<void>) {
  const store = useAppStore();
  async function retryUntilLoaded(retries: number) {
    if (retries > 0) {
      await waitFor(50);
    }
    if (store.loading) {
      return retryUntilLoaded(retries + 1);
    }
    return await promise();
  }
  return retryUntilLoaded(0);
}

export function waitFor(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function sendOrPostMessage(message: any, tabId?: number) {
  if (tabId) {
    browser.tabs.sendMessage(tabId, message);
    resetSidePanel();
  } else window.opener.postMessage(message, "*");
}

export function copyToClipboard(val: string) {
  const store = useAppStore();
  navigator.clipboard.writeText(val);
  store.setSnackbar("Copied", "info", 1000);
}
