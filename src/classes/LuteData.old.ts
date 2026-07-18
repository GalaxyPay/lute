import type { StdSignData, StdSignMetadata } from "ledger-algorand-js";
import LuteData from "./LuteData";
import { Address } from "algosdk";
import { createHash } from "crypto";
import { sendOrPostMessage } from "@/utils";
import type { Siwa } from "@/types";

export default class LuteDataOld extends LuteData {
  constructor(
    data: string,
    metadata: StdSignMetadata,
    referrer: string,
    tabId?: number
  ) {
    let siwa: Siwa;
    let authenticatorData: Uint8Array;
    try {
      const jsonString = new TextDecoder().decode(Uint8Array.fromBase64(data));
      siwa = JSON.parse(jsonString);
      authenticatorData = new Uint8Array(
        createHash("sha256").update(referrer).digest()
      );
    } catch (err: any) {
      const store = useAppStore();
      console.error(err);
      const message = {
        action: "error",
        code: 4609,
        message: "Bad JSON",
        debug: store.debug,
      };
      sendOrPostMessage(message, tabId);
      window.close();
      return;
    }
    const signData: StdSignData = {
      data,
      signer: Address.fromString(siwa.account_address).publicKey,
      domain: siwa.domain,
      authenticatorData,
    };

    super(signData, metadata, referrer, tabId);
  }
}
