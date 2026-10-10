import { emptySignatures, encodeEmptySignature } from "@/utils/emptySignature";
import algosdk from "algosdk";
import { generateKey } from "falcon-1024";
import { describe, expect, it, vi } from "vitest";

const SIGNATURE_FIELDS = new Set(["sig", "msig", "lsig", "pqsig", "sgnr"]);

/**
 * Decode as use-wallet does (PR 465 decodeEmptySignature): only signature
 * fields, at most one besides sgnr, and it must parse as a SignedTransaction.
 */
function decode(emptySig: string) {
  const map = algosdk.msgpackRawDecodeAsMap(Uint8Array.fromBase64(emptySig));
  if (!(map instanceof Map)) throw Error("not a map");
  const keys = [...map.keys()] as string[];
  expect(keys.every((k) => SIGNATURE_FIELDS.has(k))).toBe(true);
  expect(keys.filter((k) => k !== "sgnr").length).toBeLessThanOrEqual(1);
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
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
  map.set("txn", algosdk.msgpackRawDecodeAsMap(algosdk.encodeMsgpack(txn)));
  return algosdk.decodeSignedTransaction(algosdk.msgpackRawEncode(map));
}

const addr = () => algosdk.generateAccount().addr.toString();
const info = (address: string, authAddr?: string) =>
  ({
    address,
    authAddr: authAddr ? algosdk.Address.fromString(authAddr) : undefined,
  }) as any;

function hot(a: string, authAddr?: string) {
  return {
    addr: a,
    isHot: true,
    isFalcon25: false,
    canSign: true,
    info: info(a, authAddr),
  } as any;
}

function falcon() {
  const { publicKey } = generateKey(crypto.getRandomValues(new Uint8Array(48)));
  const { address } = algosdk.addressFromPQKey(
    algosdk.FALCON_1024_SCHEME,
    publicKey
  );
  const a = address.toString();
  return {
    publicKey,
    acct: {
      addr: a,
      isHot: false,
      isFalcon25: true,
      canSign: true,
      falconPk: publicKey.toBase64(),
      info: info(a),
    } as any,
  };
}

function msig() {
  const params = { version: 1, threshold: 2, addrs: [addr(), addr(), addr()] };
  const a = algosdk.multisigAddress(params).toString();
  return {
    params,
    acct: {
      addr: a,
      appId: 77n,
      isHot: false,
      isFalcon25: false,
      canSign: false,
      info: info(a),
    } as any,
  };
}

/** A rekey entry as the store builds it: the authorizer's flags. */
function rekeyedTo(auth: any) {
  const a = addr();
  return {
    addr: a,
    isHot: false,
    isFalcon25: auth.isFalcon25,
    canSign: auth.canSign,
    subType: "rekey",
    info: info(a, auth.addr),
  } as any;
}

const noMsig = async () => undefined;

describe("encodeEmptySignature", () => {
  it("encodes a single ed25519 key as an empty map", () => {
    expect(encodeEmptySignature({})).toBe("gA==");
  });

  it("matches algosdk's own Falcon placeholder", async () => {
    const { publicKey, acct } = falcon();
    const signer = algosdk.addressWithSignersFromRawFalcon1024Signer({
      falcon1024PublicKey: publicKey,
      falcon1024Signer: async () => new Uint8Array(),
    });
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: acct.addr,
      receiver: acct.addr,
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
    const [blob] = await signer.emptyTxnSigner([txn], [0]);
    const { pqsig } = algosdk.decodeSignedTransaction(blob!);
    const out = await emptySignatures([acct.addr], [acct], noMsig);
    expect(out[acct.addr]).toBe(encodeEmptySignature({ pqsig: pqsig! }));
  });
});

describe("emptySignatures", () => {
  it("gives hot, HD and Ledger accounts a single ed25519 key", async () => {
    const h = hot(addr());
    const hd = { ...hot(addr()), isHot: false, subType: "hd", slot: 0 };
    const ledger = { ...hot(addr()), isHot: false, slot: 3 };
    const out = await emptySignatures(
      [h.addr, hd.addr, ledger.addr],
      [h, hd, ledger],
      noMsig
    );
    expect(out).toEqual({
      [h.addr]: "gA==",
      [hd.addr]: "gA==",
      [ledger.addr]: "gA==",
    });
  });

  it("describes a Falcon account by its recorded public key", async () => {
    const { acct } = falcon();
    const out = await emptySignatures([acct.addr], [acct], noMsig);
    const { pqsig, sgnr } = decode(out[acct.addr]!);
    expect(algosdk.addressFromPQSig(pqsig!).toString()).toBe(acct.addr);
    expect(sgnr).toBeUndefined();
  });

  it("leaves out a Falcon account with no recorded public key", async () => {
    const { acct } = falcon();
    delete acct.falconPk;
    expect(await emptySignatures([acct.addr], [acct], noMsig)).toEqual({});
  });

  it("gives an ARC-55 account its multisig, loading each app once", async () => {
    const { params, acct } = msig();
    const rekeyed = rekeyedTo(acct);
    const load = vi.fn(async () => params);
    const out = await emptySignatures(
      [acct.addr, rekeyed.addr],
      [acct, rekeyed],
      load
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(77n);
    const { msig: m } = decode(out[acct.addr]!);
    expect(m!.thr).toBe(2);
    expect(m!.subsig.every((s) => !s.s)).toBe(true);
    expect(
      algosdk
        .multisigAddress({
          version: m!.v,
          threshold: m!.thr,
          addrs: m!.subsig.map((s) => new algosdk.Address(s.pk)),
        })
        .toString()
    ).toBe(acct.addr);
    expect(decode(out[rekeyed.addr]!).sgnr?.toString()).toBe(acct.addr);
  });

  it("leaves out a multisig whose parameters do not match its address", async () => {
    const { params, acct } = msig();
    const load = async () => ({ ...params, threshold: 1 });
    expect(await emptySignatures([acct.addr], [acct], load)).toEqual({});
  });

  it("gives a rekeyed account its authorizer's type plus sgnr", async () => {
    const auth = hot(addr());
    const { acct: f } = falcon();
    const toHot = rekeyedTo(auth);
    const toFalcon = rekeyedTo(f);
    const out = await emptySignatures(
      [toHot.addr, toFalcon.addr],
      [auth, f, toHot, toFalcon],
      noMsig
    );
    const viaHot = decode(out[toHot.addr]!);
    expect(viaHot.sgnr?.toString()).toBe(auth.addr);
    expect(viaHot.sig).toBeUndefined();
    const viaFalcon = decode(out[toFalcon.addr]!);
    expect(viaFalcon.sgnr?.toString()).toBe(f.addr);
    expect(algosdk.addressFromPQSig(viaFalcon.pqsig!).toString()).toBe(f.addr);
  });

  it("leaves out watch accounts, foreign authorizers and unloaded info", async () => {
    const watch = { ...hot(addr()), isHot: false, canSign: false };
    const foreign = hot(addr(), addr());
    const unloaded = { ...hot(addr()), info: undefined };
    const out = await emptySignatures(
      [watch.addr, foreign.addr, unloaded.addr],
      [watch, foreign, unloaded],
      noMsig
    );
    expect(out).toEqual({});
  });

  it("keeps the other accounts when a multisig fails to load", async () => {
    const { acct } = msig();
    const h = hot(addr());
    const load = async () => {
      throw Error("algod down");
    };
    const out = await emptySignatures([acct.addr, h.addr], [acct, h], load);
    expect(out).toEqual({ [h.addr]: "gA==" });
  });
});
