import type { SignDataResponseSafe, SignDataSafe } from "@/types";
import type { StdSignData, StdSignDataResponse } from "ledger-algorand-js";

export function signDataSafe(obj: StdSignData): SignDataSafe {
  return {
    ...obj,
    signer: obj.signer.toBase64(),
    authenticatorData: obj.authenticatorData.toBase64(),
  };
}

export function signDataUnsafe(obj: SignDataSafe): StdSignData {
  return {
    ...obj,
    signer: Uint8Array.fromBase64(obj.signer),
    authenticatorData: Uint8Array.fromBase64(obj.authenticatorData),
  };
}

export function signDataResponseSafe(
  obj: StdSignDataResponse
): SignDataResponseSafe {
  return {
    ...obj,
    signer: obj.signer.toBase64(),
    authenticatorData: obj.authenticatorData.toBase64(),
    signature: obj.signature.toBase64(),
  };
}

export function signDataResponseUnsafe(
  obj: SignDataResponseSafe
): StdSignDataResponse {
  return {
    ...obj,
    signer: Uint8Array.fromBase64(obj.signer),
    authenticatorData: Uint8Array.fromBase64(obj.authenticatorData),
    signature: Uint8Array.fromBase64(obj.signature),
  };
}
