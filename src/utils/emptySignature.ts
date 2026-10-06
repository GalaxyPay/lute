// Empty signatures for the connect reply: how each connected account signs,
// with placeholder bytes, so a dapp can simulate fees with correctly shaped
// signatures (use-wallet `WalletAccount.emptySignature`).
//
// Wire format: base64 of the canonical msgpack encoding of a SignedTransaction
// with the `txn` field removed. A single ed25519 key encodes as an empty map
// ("gA=="), a rekeyed account adds `sgnr`, a multisig carries `msig` with the
// member keys and no signatures, and a Falcon account carries `pqsig` with its
// public key and an empty signature. An account left out is of unknown type.
//
// Kept free of the store and network so it can be tested on its own.
import type { AccountInfo, MultisigMetadata } from "@/types";
import algosdk, { SignedTransaction, type EncodedMultisig } from "algosdk";

export type EmptySignatureFields = {
  msig?: EncodedMultisig;
  pqsig?: algosdk.EncodedPQSig;
  sgnr?: algosdk.Address;
};

let placeholderTxn: algosdk.Transaction | undefined;

/** A throwaway txn to carry the signature fields through algosdk's codec. */
function getPlaceholderTxn() {
  placeholderTxn ??= algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: algosdk.ALGORAND_ZERO_ADDRESS_STRING,
    receiver: algosdk.ALGORAND_ZERO_ADDRESS_STRING,
    amount: 0,
    suggestedParams: {
      fee: 0,
      minFee: 0,
      firstValid: 0,
      lastValid: 0,
      genesisHash: new Uint8Array(32),
      flatFee: true,
    },
  });
  return placeholderTxn;
}

/** Encode signature fields as an empty signature (see the format above). */
export function encodeEmptySignature(fields: EmptySignatureFields) {
  const stxn = new SignedTransaction({ ...fields, txn: getPlaceholderTxn() });
  const map = algosdk.msgpackRawDecodeAsMap(algosdk.encodeMsgpack(stxn)) as Map<
    string,
    unknown
  >;
  map.delete("txn");
  return algosdk.msgpackRawEncode(map).toBase64();
}

/** Loads an ARC-55 app's multisig parameters, or undefined if it cannot. */
export type MsigLoader = (
  appId: bigint
) => Promise<MultisigMetadata | undefined>;

/**
 * The signature fields of the account that authorizes `addr`'s transactions,
 * found among Lute's own account entries. Undefined when Lute cannot say how
 * it signs: a watch account, an authorizer Lute does not hold, a Falcon
 * account whose public key is not recorded yet, or a multisig whose
 * parameters cannot be loaded or do not match its address.
 */
async function authorizerFields(
  authAddr: string,
  accts: AccountInfo[],
  loadMsig: MsigLoader
): Promise<EmptySignatureFields | undefined> {
  // A rekey entry carries its authorizer's flags under the rekeyed address,
  // so only the authorizer's own entry describes the authorizer.
  const auth = accts.find((a) => a.addr === authAddr && a.subType !== "rekey");
  if (!auth) return undefined;
  if (auth.isFalcon25) {
    if (!auth.falconPk) return undefined;
    const pk = Uint8Array.fromBase64(auth.falconPk);
    const { address, salt } = algosdk.addressFromPQKey(
      algosdk.FALCON_1024_SCHEME,
      pk
    );
    if (address.toString() !== authAddr) return undefined;
    return {
      pqsig: {
        sch: algosdk.FALCON_1024_SCHEME,
        slt: salt,
        pk,
        sig: new Uint8Array(),
      },
    };
  }
  if (auth.appId != null) {
    const params = await loadMsig(BigInt(auth.appId));
    if (!params) return undefined;
    if (algosdk.multisigAddress(params).toString() !== authAddr)
      return undefined;
    return {
      msig: {
        v: params.version,
        thr: params.threshold,
        subsig: params.addrs.map((m) => ({
          pk: algosdk.Address.fromString(m).publicKey,
        })),
      },
    };
  }
  // Hot (Algo25), HD and Ledger accounts all sign with one ed25519 key.
  if (auth.canSign) return {};
  return undefined;
}

/**
 * Empty signatures for the connecting accounts, keyed by address. `accts` is
 * Lute's account list as shown on the connect page; each address is described
 * by the account that authorizes it on chain. An account Lute cannot describe
 * is left out (unknown type), and a failure for one account never affects the
 * others.
 */
export async function emptySignatures(
  addrs: string[],
  accts: AccountInfo[],
  loadMsig: MsigLoader
): Promise<Record<string, string>> {
  const msigs = new Map<bigint, ReturnType<MsigLoader>>();
  const cachedLoad: MsigLoader = (appId) => {
    let p = msigs.get(appId);
    if (!p) {
      p = loadMsig(appId).catch(() => undefined);
      msigs.set(appId, p);
    }
    return p;
  };
  const entries = await Promise.all(
    addrs.map(async (addr) => {
      try {
        const acct = accts.find((a) => a.addr === addr);
        // Without its on-chain info Lute cannot tell whether the account is
        // rekeyed, and a wrong authorizer is worse than none.
        if (!acct?.info) return undefined;
        const authAddr = acct.info?.authAddr?.toString() ?? addr;
        const fields = await authorizerFields(authAddr, accts, cachedLoad);
        if (!fields) return undefined;
        if (authAddr !== addr)
          fields.sgnr = algosdk.Address.fromString(authAddr);
        return [addr, encodeEmptySignature(fields)] as const;
      } catch (err) {
        console.error(err);
        return undefined;
      }
    })
  );
  return Object.fromEntries(entries.filter((e) => !!e));
}
