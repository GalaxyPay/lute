import Algo, { getAuthAccts } from "@/services/Algo";
import type { AccountSubs } from "@/types";
import {
  BIP32DerivationType,
  deriveChildNodePublic,
  fromSeed,
  harden,
  KeyContext,
  XHDWalletAPI,
} from "@algorandfoundation/xhd-wallet-api";
import { Address, encodeAddress } from "algosdk";

const HdWallet = {
  async deriveAccts(seed: Uint8Array, startIndex: number = 0) {
    const accts: AccountSubs[] = [];
    const cryptoService = new XHDWalletAPI();
    const rootKey = fromSeed(seed);
    for (let i = startIndex; i < 4 + startIndex; i++) {
      const key = await cryptoService.keyGen(rootKey, KeyContext.Address, i, 0);
      const addr = new Address(key).toString();
      const ai: AccountSubs = await Algo.algod.accountInformation(addr).do();
      const aa = await getAuthAccts(addr);
      ai.subs = aa;
      const xpubArr = await cryptoService.deriveKey(
        rootKey,
        [harden(44), harden(283), harden(i), 0],
        false,
        BIP32DerivationType.Peikert
      );
      ai.xpub = xpubArr.toBase64();
      accts.push(ai);
    }
    rootKey.fill(0);
    return accts;
  },

  async deriveAddr(xpub: string, index: number) {
    const xpubArr = Uint8Array.fromBase64(xpub);
    const childExtended = await deriveChildNodePublic(xpubArr, index);
    const childPub = childExtended.slice(0, 32);
    return encodeAddress(childPub);
  },

  /**
   * Signs `bytes` exactly as given, so they must already be domain-separated
   * (ARC-60 signs a hash). Transactions go through signTxn. Zeroes `seed`.
   */
  async sign(
    seed: Uint8Array,
    slot: number,
    bytes: Uint8Array,
    addrIdx: number = 0
  ) {
    return await withRootKey(seed, (api, rootKey) =>
      api.signData(rootKey, KeyContext.Address, slot, addrIdx, bytes)
    );
  },

  /**
   * Signs a txn's bytesToSign ("TX" || encoded txn); the library refuses
   * anything without the "TX" tag. Zeroes `seed`.
   */
  async signTxn(
    seed: Uint8Array,
    slot: number,
    bytesToSign: Uint8Array,
    addrIdx: number = 0
  ) {
    return await withRootKey(seed, (api, rootKey) =>
      api.signAlgoTransaction(
        rootKey,
        KeyContext.Address,
        slot,
        addrIdx,
        bytesToSign
      )
    );
  },
};

async function withRootKey(
  seed: Uint8Array,
  sign: (api: XHDWalletAPI, rootKey: Uint8Array) => Promise<Uint8Array>
) {
  const rootKey = fromSeed(seed);
  seed.fill(0);
  try {
    return await sign(new XHDWalletAPI(), rootKey);
  } finally {
    rootKey.fill(0);
  }
}

export default HdWallet;
