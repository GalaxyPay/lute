import {
  BIP32DerivationType,
  harden,
  XHDWalletAPI,
} from "@algorandfoundation/xhd-wallet-api";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import * as bip39 from "@scure/bip39";
import algosdk from "algosdk";

// Recovers the accounts a Ledger device's Algorand app derives from its BIP39
// mnemonic, as plain Algo25 keys. Break-glass only: the key leaves the device.

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");

/**
 * BOLOS root key (HDW_NORMAL, CX_CURVE_Ed25519). Unlike xhd-wallet-api's
 * fromSeed, both halves are HMACs keyed with "ed25519 seed".
 * @returns kL || kR || chain code (96 bytes)
 */
function root(mnemonic: string, passphrase = "") {
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
  let k = hmac(sha512, ED25519_SEED, seed);
  while (k[31] & 0x20) k = hmac(sha512, ED25519_SEED, k);
  k[0] &= 0xf8;
  k[31] = (k[31] & 0x7f) | 0x40;
  const c = hmac(sha256, ED25519_SEED, new Uint8Array([1, ...seed]));
  const rootKey = new Uint8Array([...k, ...c]);
  seed.fill(0);
  k.fill(0);
  return rootKey;
}

/**
 * The app signs with m/44'/283'/account'/0/0 (standard BIP32-Ed25519), then
 * uses the node's kL as an ordinary Ed25519 seed, i.e. an Algo25 key.
 * @returns the account's Algo25 mnemonic
 */
async function mnemonic(rootKey: Uint8Array, account: number) {
  const node = await new XHDWalletAPI().deriveKey(
    rootKey,
    [harden(44), harden(283), harden(account), 0, 0],
    true,
    BIP32DerivationType.Khovratovich
  );
  const mn = algosdk.mnemonicFromSeed(node.subarray(0, 32));
  node.fill(0);
  return mn;
}

const LedgerRecovery = { root, mnemonic };

export default LedgerRecovery;
