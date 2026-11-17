import Signer, { SignContext } from "@/services/Signer";
import type {
  Siwa,
  StdSignData,
  StdSignDataResponse,
  StdSignMetadata,
} from "@/types";
import {
  formatAddr,
  isBadPassword,
  needsPassword,
  signDataResponseSafe,
  selectDevice,
  sendOrPostMessage,
} from "@/utils";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { addressFromPQKey, encodeAddress, FALCON_1024_SCHEME } from "algosdk";
import { canonify } from "canonify";
import { FALCON_DET1024_PUBKEY_SIZE } from "falcon-1024";
import { AlgorandApp } from "ledger-algorand-js";

export enum ScopeType {
  UNKNOWN = -1,
  AUTH = 1,
}

async function sha256(data: BufferSource) {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

class SignDataError extends Error {
  code: number;
  data?: any;

  constructor(message: string, code: number, data?: any) {
    super(message);
    this.name = "SignDataError";
    this.code = code;
    this.data = data;
  }
}

// Error Codes & Messages
export const ERROR_INVALID = new SignDataError("Invalid Request", 4300);
export const ERROR_INVALID_SCOPE = new SignDataError("Invalid Scope", 4600);
export const ERROR_UNSUPPORTED_SCHEME = new SignDataError(
  "Unsupported Scheme",
  4601
);
export const ERROR_FAILED_DECODING = new SignDataError("Failed decoding", 4602);
export const ERROR_INVALID_SIGNER = new SignDataError("Invalid Signer", 4603);
export const ERROR_BAD_JSON = new SignDataError("Bad JSON", 4609);
export const ERROR_FAILED_DOMAIN_AUTH = new SignDataError(
  "Failed Domain Auth",
  4610
);

const SIGNER_SIZE: Record<Siwa["type"], number> = {
  ed25519: 32,
  "falcon-1024-det": FALCON_DET1024_PUBKEY_SIZE,
};

const SIWA_REQUIRED = [
  "domain",
  "account_address",
  "uri",
  "version",
  "chain_id",
] as const;
const SIWA_OPTIONAL = [
  "statement",
  "nonce",
  "issued-at",
  "expiration-time",
  "not-before",
  "request-id",
] as const;
const SIWA_KEYS = new Set<string>([
  ...SIWA_REQUIRED,
  ...SIWA_OPTIONAL,
  "resources",
  "type",
]);

/**
 * Whether `v` is a SIWA message. Unknown keys are rejected: the message must
 * match its canonical JSON exactly, so an extra key could never pass anyway.
 */
export function isSiwa(v: unknown): v is Siwa {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => !SIWA_KEYS.has(k))) return false;
  if (SIWA_REQUIRED.some((k) => typeof o[k] !== "string")) return false;
  if (SIWA_OPTIONAL.some((k) => k in o && typeof o[k] !== "string"))
    return false;
  if (
    "resources" in o &&
    !(
      Array.isArray(o.resources) &&
      o.resources.every((r) => typeof r === "string")
    )
  )
    return false;
  return typeof o.type === "string" && Object.hasOwn(SIGNER_SIZE, o.type);
}

export default class LuteData {
  stdSignData: StdSignData;
  metadata: StdSignMetadata;
  referrer: string;
  tabId?: number;
  store = useAppStore();
  jsonString?: string;
  siwa?: Siwa;
  // siwa is parsed before checks that can fail, so siwa alone does not mean valid.
  validated = false;
  /**
   * Why Lute cannot sign this request, found before the user pressed Sign.
   * The page shows it instead of Sign and replies with it on close.
   */
  signerError?: SignDataError;
  // A reply was sent; the dapp gets only one.
  finished = false;

  constructor(
    stdSignData: StdSignData,
    metadata: StdSignMetadata,
    referrer: string,
    tabId?: number
  ) {
    if (!stdSignData || !metadata || !referrer) throw ERROR_INVALID;
    this.stdSignData = stdSignData;
    this.metadata = metadata;
    this.referrer = referrer;
    this.tabId = tabId;
  }

  private sendAndClose(message: any) {
    this.finished = true;
    sendOrPostMessage(message, this.tabId);
    window.close();
  }

  async handleError(err: SignDataError) {
    // The dapp already has its answer.
    if (this.finished) return;
    this.sendAndClose({
      action: "error",
      code: err.code || 4300,
      message: err.message,
      debug: this.store.debug,
    });
  }

  async validate() {
    this.validated = false;
    try {
      switch (this.metadata.encoding) {
        case "base64":
          this.jsonString = new TextDecoder().decode(
            Uint8Array.fromBase64(this.stdSignData.data)
          );
          break;
        default:
          throw ERROR_FAILED_DECODING;
      }

      const enc = new TextEncoder();
      const domainHash = await sha256(enc.encode(this.stdSignData.domain));
      // check that the first 32 bytes of authenticatorData are the same as the sha256 of domain
      if (
        Buffer.compare(
          this.stdSignData.authenticatorData.slice(0, 32),
          domainHash
        ) !== 0
      ) {
        throw ERROR_FAILED_DOMAIN_AUTH;
      }

      // validate against schema
      switch (this.metadata.scope) {
        case ScopeType.AUTH:
          let parsed: unknown;
          try {
            parsed = JSON.parse(this.jsonString);
          } catch (err: any) {
            console.error(err);
            throw ERROR_BAD_JSON;
          }
          if (!isSiwa(parsed)) throw ERROR_BAD_JSON;
          this.siwa = parsed;

          const canonifiedJson = canonify(this.siwa);
          if (!canonifiedJson || canonifiedJson !== this.jsonString) {
            throw ERROR_BAD_JSON;
          }

          // scheme defaults to ed25519 when omitted and must match siwa.type;
          // isSiwa limits siwa.type to known schemes, so any unknown
          // scheme fails here too.
          if (this.siwa.type !== (this.stdSignData.scheme ?? "ed25519"))
            throw ERROR_UNSUPPORTED_SCHEME;

          // the signer must be a public key of the requested scheme
          if (this.stdSignData.signer.length !== SIGNER_SIZE[this.siwa.type])
            throw ERROR_INVALID_SIGNER;
          // check that siwa.domain, signData.domain, and referrer all match
          if (
            this.siwa.domain !== this.stdSignData.domain ||
            this.stdSignData.domain !== this.referrer
          )
            throw ERROR_FAILED_DOMAIN_AUTH;
          break;
        default:
          throw ERROR_INVALID_SCOPE;
      }
      this.signerError = undefined;
      try {
        this.earlySignerCheck();
      } catch (err: any) {
        this.signerError = err;
      }
      this.validated = true;
    } catch (err: any) {
      this.handleError(err);
    }
  }

  /**
   * The wallet account holding the key the request names, or a 4603 saying
   * why there is none, worded for the dapp to show as is.
   */
  private signerAddr() {
    if (!this.siwa) throw ERROR_BAD_JSON;
    const signer = this.stdSignData.signer;
    // A Falcon address is a hash of its public key, an ed25519 address is
    // the key itself.
    return this.siwa.type === "falcon-1024-det"
      ? addressFromPQKey(FALCON_1024_SCHEME, signer).address.toString()
      : encodeAddress(signer);
  }

  private signerAcct() {
    const signerAddr = this.signerAddr();
    const signer = this.stdSignData.signer;
    const isFalcon = this.siwa!.type === "falcon-1024-det";
    const acct = this.store.acctInfo.find((a) => a.addr === signerAddr);
    const who = `Account ${formatAddr(signerAddr)}`;
    const fail = (why: string) => new SignDataError(`${who} ${why}`, 4603);
    if (!acct) throw fail("is not in Lute");
    // A rekey row borrows its signer's canSign but holds no key of its own.
    if (acct.subType === "rekey")
      throw fail("is rekeyed; sign in with the account it is rekeyed to");
    // A watch or multi-sig account.
    if (!acct.canSign) throw fail("has no signing key in Lute");
    // The account must sign with the scheme the request names.
    if (!!acct.isFalcon25 !== isFalcon)
      throw fail(`is not a ${isFalcon ? "Falcon" : "ed25519"} account`);
    return { acct, isFalcon, signer };
  }

  /**
   * signerAcct before the user presses Sign, for what it can already tell:
   * HD sibling and rekey rows come from on-chain info, which a modal page
   * may not have loaded yet, so a miss is only final with none possible.
   */
  private earlySignerCheck() {
    const addr = this.signerAddr();
    const mayLoadLater =
      !this.store.acctInfo.some((a) => a.addr === addr) &&
      this.store.accounts.some((a) => a.xpub && a.idxs?.length);
    if (!mayLoadLater) this.signerAcct();
  }

  /** The user closed a request earlySignerCheck refused: tell the dapp why. */
  rejectUnsignable() {
    if (this.signerError) this.handleError(this.signerError);
  }

  async setNetwork() {
    // sets the network for display purposes only, does not lookup authAddr
    if (!this.siwa) throw ERROR_BAD_JSON;
    const [_prefix, id] = this.siwa.chain_id.split(":", 2);

    const network =
      id === "localnet"
        ? "LocalNet"
        : this.store.allNetworks.find((n) => n.genesisHash?.startsWith(id))
            ?.name;
    if (network) this.store.networkName = network;
  }

  getMessage() {
    if (!this.siwa) throw ERROR_BAD_JSON;
    return (
      `URI: ${this.siwa.uri}\n` +
      `Version: ${this.siwa.version}\n` +
      `Chain ID: ${this.siwa.chain_id}\n` +
      (this.siwa.nonce ? `Nonce: ${this.siwa.nonce}\n` : "") +
      (this.siwa["issued-at"] ? `Issued At: ${this.siwa["issued-at"]}\n` : "") +
      (this.siwa.resources
        ? `Resources:\n- ${(this.siwa.resources ?? []).join("\n- ")}\n`
        : "")
    );
  }

  async sign(password?: string) {
    try {
      if (!this.validated || !this.jsonString || !this.siwa)
        throw ERROR_INVALID;
      const { acct, isFalcon, signer } = this.signerAcct();

      const enc = new TextEncoder();
      const dataHash = await sha256(enc.encode(this.jsonString));
      const authHash = await sha256(
        Buffer.from(this.stdSignData.authenticatorData)
      );
      const toSign = new Uint8Array([...dataHash, ...authHash]);

      let signature: Uint8Array;
      if (isFalcon) {
        const ctx = new SignContext(password);
        try {
          const res = await Signer.signFalconBytes(acct, toSign, ctx);
          // The key held must be the one the dapp will verify against.
          if (Buffer.compare(res.publicKey, signer) !== 0)
            throw ERROR_INVALID_SIGNER;
          signature = res.signature;
        } finally {
          ctx.dispose();
        }
      } else if (acct.seedId && acct.slot != null) {
        const ctx = new SignContext(password);
        try {
          signature = await Signer.signBytes(acct, toSign, ctx);
        } finally {
          ctx.dispose();
        }
      } else if (acct?.slot != null) {
        this.stdSignData.hdPath = `m/44'/283'/${acct.slot}'/0/0`;
        await this.store.getDevices();
        const t = this.store.device.transport;
        if (!t) throw Error("This browser does not support Ledger");
        const hidOrUsb = t === "hid" ? TransportWebHID : TransportWebUSB;
        let transport;
        const firstDevice = this.store.device.list[0] as HIDDevice & USBDevice;
        if (firstDevice && !this.store.ledgerSelect) {
          transport = await hidOrUsb.open(firstDevice);
        } else {
          this.store.device.showSelector = true;
          const device = await selectDevice();
          this.store.device.showSelector = false;
          transport = await hidOrUsb.open(device);
        }
        const algoApp = new AlgorandApp(transport);
        this.store.setSnackbar("Review on Ledger...", "info", -1);
        const resp = await algoApp.signData(this.stdSignData, this.metadata);
        signature = resp.signature;
      } else {
        const ctx = new SignContext(password);
        try {
          signature = await Signer.signBytes(acct, toSign, ctx);
        } finally {
          ctx.dispose();
        }
      }
      const signerResponse: StdSignDataResponse = {
        ...this.stdSignData,
        signature,
      };
      const message = {
        action: "signed",
        signerResponse: this.store.isWeb
          ? signerResponse
          : signDataResponseSafe(signerResponse),
        debug: this.store.debug,
      };
      this.store.snackbar.display = false;
      this.sendAndClose(message);
      return true;
    } catch (err: any) {
      const t = this.store.device.transport;
      if (t) {
        const devices = await navigator[t].getDevices();
        const openDevices = devices.filter((d: any) => d.opened);
        if (openDevices.length) await openDevices[0]?.close();
      }
      if (isBadPassword(err)) {
        // Let the caller re-prompt rather than failing the whole request.
        this.store.setSnackbar("Incorrect password", "error");
        return false;
      }
      // Unlocked, but this seed missed the cache: prompt, nothing is wrong.
      if (needsPassword(err)) return false;
      if (["Locked", "open"].some((x) => err.message.includes(x))) {
        this.store.setSnackbar(err.message, "error");
      } else {
        this.handleError(err);
      }
      return true;
    }
  }
}
