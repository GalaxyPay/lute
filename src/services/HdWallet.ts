import Algo, { getAuthAccts } from "@/services/Algo";
import type { AccountSubs } from "@/types";
import {
  BIP32DerivationType,
  deriveChildNodePublic,
  fromSeed,
  harden,
  KeyContext,
  XHDWalletAPI,
} from "@/utils/xhd";
import algosdk from "algosdk";

const HdWallet = {
  async deriveAccts(seed: Buffer, startIndex: number = 0) {
    const accts: AccountSubs[] = [];
    const cryptoService = new XHDWalletAPI();
    const rootKey = fromSeed(seed);
    const indexer = Algo.indexer;
    for (let i = startIndex; i < 4 + startIndex; i++) {
      const key = await cryptoService.keyGen(rootKey, KeyContext.Address, i, 0);
      const addr = new algosdk.Address(key).toString();
      const ai: AccountSubs = await Algo.algod.accountInformation(addr).do();
      const aa = await getAuthAccts(addr, indexer);
      ai.subs = aa;
      const xpubArr = await cryptoService.deriveKey(
        rootKey,
        [harden(44), harden(283), harden(i), 0],
        false,
        BIP32DerivationType.Peikert
      );
      ai.xpub = Buffer.from(xpubArr).toString("base64");
      accts.push(ai);
    }
    rootKey.fill(0);
    return accts;
  },

  async deriveAddr(xpub: string, index: number) {
    const xpubArr = Buffer.from(xpub, "base64");
    const childExtended = await deriveChildNodePublic(xpubArr, index);
    const childPub = childExtended.slice(0, 32);
    return algosdk.encodeAddress(childPub);
  },

  async sign(
    seed: Buffer,
    slot: number,
    bytes: Uint8Array,
    addrIdx: number = 0
  ) {
    const cryptoService = new XHDWalletAPI();
    const rootKey = fromSeed(seed);
    seed.fill(0);
    const sig = await cryptoService.signAlgoTransaction(
      rootKey,
      KeyContext.Address,
      slot,
      addrIdx,
      bytes
    );
    rootKey.fill(0);
    return sig;
  },
};

export default HdWallet;
