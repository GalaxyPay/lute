import HdWallet from "@/services/HdWallet";
import Seed from "@/services/Seed";
import type { Siwa } from "@/types";
import { selectDevice, sendOrPostMessage } from "@/utils";
import { hotSign } from "@/utils/signers";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { Address } from "algosdk";
import { canonify } from "canonify";
import {
  AlgorandApp,
  type SignData,
  type SignDataResponse,
  type SignMetadata,
} from "ledger-algorand-js";
import { z } from "zod";

enum ScopeType {
  UNKNOWN = -1,
  AUTH = 1,
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
export const ERROR_FAILED_DECODING = new SignDataError("Failed decoding", 4602);
export const ERROR_INVALID_SIGNER = new SignDataError("Invalid Signer", 4603);
export const ERROR_BAD_JSON = new SignDataError("Bad JSON", 4609);
export const ERROR_FAILED_DOMAIN_AUTH = new SignDataError(
  "Failed Domain Auth",
  4610
);

export default class LuteData {
  data: string;
  metadata: SignMetadata;
  authenticatorData: Uint8Array;
  tabId?: number;
  store = useAppStore();
  jsonString?: string;
  siwa?: Siwa;

  constructor(
    data: string,
    metadata: SignMetadata,
    authenticatorData: Uint8Array,
    tabId?: number
  ) {
    if (!data || !metadata || !authenticatorData) throw ERROR_INVALID;
    this.data = data;
    this.metadata = metadata;
    this.authenticatorData = authenticatorData;
    this.tabId = tabId;
  }

  async handleError(err: SignDataError) {
    const message = {
      action: "error",
      code: err.code || 4300,
      message: err.message,
      debug: this.store.debug,
    };
    sendOrPostMessage(message, this.tabId);
    window.close();
  }

  async validate() {
    try {
      const siwaSchema: z.ZodType<Siwa> = z.object({
        domain: z.string(),
        account_address: z.string(),
        uri: z.string(),
        version: z.string(),
        statement: z.string().optional(),
        nonce: z.string().optional(),
        "issued-at": z.string().optional(),
        "expiration-time": z.string().optional(),
        "not-before": z.string().optional(),
        "request-id": z.string().optional(),
        chain_id: z.literal("283"),
        resources: z.string().array().optional(),
        type: z.literal("ed25519"),
      });

      switch (this.metadata.encoding) {
        case "base64":
          this.jsonString = Buffer.from(this.data, "base64").toString();
          break;
        default:
          throw ERROR_FAILED_DECODING;
      }

      // validate against schema
      switch (this.metadata.scope) {
        case ScopeType.AUTH:
          try {
            this.siwa = siwaSchema.parse(JSON.parse(this.jsonString));
          } catch (err: any) {
            console.error(err);
            throw ERROR_BAD_JSON;
          }

          const canonifiedJson = canonify(this.siwa);
          if (!canonifiedJson || canonifiedJson !== this.jsonString) {
            throw ERROR_BAD_JSON;
          }

          const rp_id_hash = await crypto.subtle.digest(
            "SHA-256",
            Buffer.from(this.siwa.domain)
          );
          // check that the first 32 bytes of authenticatorData are the same as the sha256 of domain
          if (
            Buffer.compare(
              this.authenticatorData.slice(0, 32),
              Buffer.from(rp_id_hash)
            ) !== 0
          ) {
            throw ERROR_FAILED_DOMAIN_AUTH;
          }
          break;
        default:
          throw ERROR_INVALID_SCOPE;
      }
    } catch (err: any) {
      this.handleError(err);
    }
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
      if (!this.jsonString || !this.siwa) throw ERROR_INVALID;
      const acct = this.store.acctInfo
        .filter((a) => a.canSign && a.subType !== "rekey")
        .find((a) => a.addr === this.siwa!.account_address);
      if (!acct) throw ERROR_INVALID_SIGNER;

      const dataHash = await crypto.subtle.digest(
        "SHA-256",
        Buffer.from(this.jsonString)
      );
      const authHash = await crypto.subtle.digest(
        "SHA-256",
        Buffer.from(this.authenticatorData)
      );
      const toSign = Buffer.concat([
        Buffer.from(dataHash),
        Buffer.from(authHash),
      ]);

      let signature: Uint8Array;
      const signData: SignData = {
        data: this.data,
        signer: Address.fromString(this.siwa.account_address).publicKey,
        domain: this.siwa.domain,
        authenticatorData: this.authenticatorData,
      };
      if (acct?.seedId && acct.slot != null) {
        let seed: Buffer;
        const seedData = this.store.seeds.find((s) => s.id === acct.seedId);
        if (!seedData) throw Error("Invalid Seed");
        if (seedData.credentialId) {
          seed = (await Seed.getPasskeySeed(seedData.credentialId)).seed;
        } else {
          if (!password) throw Error("Password Required");
          seed = await Seed.decryptSeed(password, seedData);
        }
        signature = await HdWallet.sign(
          seed,
          acct.slot,
          toSign,
          acct?.info?.addrIdx
        );
        seed.fill(0);
      } else if (acct?.slot != null) {
        signData.hdPath = `m/44'/283'/${acct.slot}'/0/0`;
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
        const resp = await algoApp.signData(signData, this.metadata);
        signature = resp.signature;
      } else {
        signature = await hotSign(this.siwa.account_address, toSign);
      }
      const signerResponse: SignDataResponse = {
        ...signData,
        signature,
      };
      const signerResponse64 = {
        ...signerResponse,
        signature: Buffer.from(signerResponse.signature).toString("base64"),
        signer: Buffer.from(signerResponse.signer).toString("base64"),
        authenticatorData: Buffer.from(
          signerResponse.authenticatorData
        ).toString("base64"),
      };
      const message = {
        action: "signed",
        signerResponse: this.store.isWeb ? signerResponse : signerResponse64,
        debug: this.store.debug,
      };
      this.store.snackbar.display = false;
      sendOrPostMessage(message, this.tabId);
      window.close();
    } catch (err: any) {
      const t = this.store.device.transport;
      if (t) {
        const devices = await navigator[t].getDevices();
        const openDevices = devices.filter((d: any) => d.opened);
        if (openDevices.length) await openDevices[0]?.close();
      }
      if (["Locked", "open"].some((x) => err.message.includes(x))) {
        this.store.setSnackbar(err.message, "error");
      } else {
        this.handleError(err);
      }
    }
  }
}
