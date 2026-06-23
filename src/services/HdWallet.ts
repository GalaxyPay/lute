import Algo, { getAuthAccts } from "@/services/Algo";
import Seed from "@/services/Seed";
import type { AccountInfo, AccountSubs, SeedData } from "@/types";
import {
  BIP32DerivationType,
  deriveChildNodePublic,
  fromSeed,
  harden,
  KeyContext,
  XHDWalletAPI,
} from "@algorandfoundation/xhd-wallet-api";
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

  async deriveChildKey(
    pass: string,
    acctInfo: AccountInfo,
    seedData?: SeedData
  ) {
    if (acctInfo.slot == null || !seedData) throw Error("Invalid");
    const addrIdx = acctInfo.info?.addrIdx || 0;
    const path = [harden(44), harden(283), harden(acctInfo.slot), 0, addrIdx];
    const seed = await Seed.decryptSeed(pass, seedData);
    const rootKey = fromSeed(seed);
    seed.fill(0);
    const xhd = new XHDWalletAPI();
    const childKey = await xhd.deriveKey(
      rootKey,
      path,
      true,
      BIP32DerivationType.Peikert
    );
    rootKey.fill(0);
    const backupKey =
      "sk:" + childKey.slice(0, 64).toBase64().replaceAll("=", "");
    childKey.fill(0);
    return backupKey;
  },
};

export default HdWallet;
