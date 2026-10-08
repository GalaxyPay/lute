export {
  badPassword,
  ed25519Sign,
  getFalconAddress,
  getFalconKey,
  isBadPassword,
  isCancelled,
  needsPassword,
  UserCancelled,
} from "./keys";

export { getAssetInfo } from "./assetInfo";
export {
  BASE_PATH,
  isFromOpener,
  postReady,
  referrerOrigin,
  resetSidePanel,
  sendOrPostMessage,
} from "./messaging";
export { refresh } from "./refresh";
export { resolveProtocol } from "./resolveProtocol";
export { send } from "./send";
export {
  composerTxns,
  falconPlaceholderSigner,
  feeForUsage,
  priceTxns,
  probeFee,
  simulateFees,
  type FeeSimTxn,
} from "./simulateFees";
export {
  signDataSafe,
  signDataUnsafe,
  signDataResponseSafe,
  signDataResponseUnsafe,
} from "./signData";

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

export function ipfs2http(url: string) {
  const ipfsGateway = "https://ipfs.algonode.dev/ipfs/";
  return url.replace("ipfs://", ipfsGateway);
}

// Inputs come from `type="number"` fields, so signs, exponents and digits past
// `dec` are rejected rather than silently dropped.
export function stringToBigint(amt: string | number, dec: number) {
  if (dec < 0 || dec > 19) throw Error("Invalid Decimals");
  const s = String(amt).trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || !/\d/.test(s)) throw Error("Invalid Amount");
  const [, int = "", frac = ""] = m;
  if (frac.length > dec) throw Error(`Amount has more than ${dec} decimals`);
  return (
    BigInt(int || "0") * 10n ** BigInt(dec) + BigInt(frac.padEnd(dec, "0") || 0)
  );
}

export function bigintToString(
  amt: bigint,
  dec: number,
  plain = false,
  round: number | undefined = undefined
): string {
  if (dec < 0 || dec > 19) throw Error("Invalid Decimals");
  const negative = amt < 0n;
  const abs = negative ? -amt : amt;
  const unit = 10n ** BigInt(dec);
  let intPart = abs / unit;
  let decimalPart = abs % unit;
  if (round !== undefined && round < dec) {
    const factor = 10n ** BigInt(dec - Math.max(round, 0));
    decimalPart = ((decimalPart + factor / 2n) / factor) * factor;
    if (decimalPart === unit) {
      intPart += 1n;
      decimalPart = 0n;
    }
  }
  const stringIntPart =
    (negative && (intPart || decimalPart) ? "-" : "") +
    (plain ? intPart.toString() : intPart.toLocaleString());
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

export function copyToClipboard(val: string) {
  const store = useAppStore();
  navigator.clipboard.writeText(val);
  store.setSnackbar("Copied", "info", 1000);
}

