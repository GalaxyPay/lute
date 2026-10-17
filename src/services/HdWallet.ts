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
import algosdk from "algosdk";

const HdWallet = {
  async deriveAddrs(seed: Buffer, startIndex: number = 0, extend = false) {
    const addrs: { value: string; xpub?: string }[] = [];
    const cryptoService = new XHDWalletAPI();
    const rootKey = fromSeed(seed);
    for (let i = startIndex; i < 4 + startIndex; i++) {
      const pk = await cryptoService.keyGen(rootKey, KeyContext.Address, i, 0);
      const addr = new algosdk.Address(pk).toString();
      const xpub = extend
        ? await cryptoService.deriveKey(
            rootKey,
            [harden(44), harden(283), harden(i), 0],
            false,
            BIP32DerivationType.Peikert
          )
        : undefined;
      addrs.push({ value: addr, xpub: xpub?.toBase64() });
    }
    rootKey.fill(0);
    return addrs;
  },

  async deriveAccts(seed: Buffer, startIndex: number = 0) {
    const addrs = await this.deriveAddrs(seed, startIndex, true);
    return await Promise.all(
      addrs.map(async (addr) => {
        const ai: AccountSubs = await Algo.algod
          .accountInformation(addr.value)
          .do();
        const aa = await getAuthAccts(addr.value);
        ai.subs = aa;
        ai.xpub = addr.xpub;
        return ai;
      })
    );
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
};

export default HdWallet;
