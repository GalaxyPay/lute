import {
  crypto_core_ed25519_scalar_add,
  crypto_core_ed25519_scalar_mul,
  crypto_core_ed25519_scalar_reduce,
  crypto_scalarmult_ed25519_base_noclamp,
} from "./sumo.facade";
import { deriveChildNodePrivate } from "./bip32-ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";

/**
 *
 */
export enum KeyContext {
  Address = 0,
  Identity = 1,
}

export enum BIP32DerivationType {
  // standard Ed25519 bip32 derivations based of: https://acrobat.adobe.com/id/urn:aaid:sc:EU:04fe29b0-ea1a-478b-a886-9bb558a5242a
  // Defines 32 bits to be zeroed from each derived zL
  Khovratovich = 32,
  // Derivations based on Peikert's ammendments to the original BIP32-Ed25519
  // Picking only 9 bits to be zeroed from each derived zL
  Peikert = 9,
}

export const harden = (num: number): number => 0x80_00_00_00 + num;

function GetBIP44PathFromContext(
  context: KeyContext,
  account: number,
  key_index: number
): number[] {
  switch (context) {
    case KeyContext.Address:
      return [harden(44), harden(283), harden(account), 0, key_index];
    case KeyContext.Identity:
      return [harden(44), harden(0), harden(account), 0, key_index];
    default:
      throw Error("Invalid context");
  }
}

export class XHDWalletAPI {
  constructor() {}

  /**
   * Derives a child key from the root key based on BIP44 path
   *
   * @param rootKey - root key in extended format (kL, kR, c). It should be 96 bytes long
   * @param bip44Path - BIP44 path (m / purpose' / coin_type' / account' / change / address_index). The ' indicates that the value is hardened
   * @param isPrivate  - if true, return the private key, otherwise return the public key
   * @returns - The extended private key (kL, kR, chainCode) or the extended public key (pub, chainCode)
   */
  async deriveKey(
    rootKey: Uint8Array,
    bip44Path: number[],
    isPrivate: boolean = true,
    derivationType: BIP32DerivationType
  ): Promise<Uint8Array> {
    // Pick `g`, which is amount of bits zeroed from each derived node
    const g: number = derivationType === BIP32DerivationType.Peikert ? 9 : 32;

    for (let i = 0; i < bip44Path.length; i++) {
      rootKey = await deriveChildNodePrivate(rootKey, bip44Path[i]!, g);
    }

    if (isPrivate) return rootKey;

    // extended public key
    // [public] [nodeCC]
    return new Uint8Array(
      Buffer.concat([
        crypto_scalarmult_ed25519_base_noclamp(rootKey.subarray(0, 32)),
        rootKey.subarray(64, 96),
      ])
    );
  }

  /**
   *
   *
   * @param context - context of the key (i.e Address, Identity)
   * @param account - account number. This value will be hardened as part of BIP44
   * @param keyIndex - key index. This value will be a SOFT derivation as part of BIP44.
   * @returns - public key 32 bytes
   */
  async keyGen(
    rootKey: Uint8Array,
    context: KeyContext,
    account: number,
    keyIndex: number,
    derivationType: BIP32DerivationType = BIP32DerivationType.Peikert
  ): Promise<Uint8Array> {
    const bip44Path: number[] = GetBIP44PathFromContext(
      context,
      account,
      keyIndex
    );

    const extendedKey: Uint8Array = await this.deriveKey(
      rootKey,
      bip44Path,
      false,
      derivationType
    );
    return extendedKey.subarray(0, 32); // only public key
  }

  /**
   * Raw Signing function called by signData and signTransaction
   *
   * Ref: https://datatracker.ietf.org/doc/html/rfc8032#section-5.1.6
   *
   * Edwards-Curve Digital Signature Algorithm (EdDSA)
   *
   * @param bip44Path
   * - BIP44 path (m / purpose' / coin_type' / account' / change / address_index)
   * @param data
   * - data to be signed in raw bytes
   *
   * @returns
   * - signature holding R and S, totally 64 bytes
   */
  private async rawSign(
    rootKey: Uint8Array,
    bip44Path: number[],
    data: Uint8Array,
    derivationType: BIP32DerivationType
  ): Promise<Uint8Array> {
    const raw: Uint8Array = await this.deriveKey(
      rootKey,
      bip44Path,
      true,
      derivationType
    );

    const scalar: Uint8Array = raw.slice(0, 32);
    const kR: Uint8Array = raw.slice(32, 64);

    // \(1): pubKey = scalar * G (base point, no clamp)
    const publicKey = crypto_scalarmult_ed25519_base_noclamp(scalar);

    // \(2): h = hash(c || msg) mod q
    const r = crypto_core_ed25519_scalar_reduce(
      sha512(Buffer.concat([kR, data]))
    );

    // \(4):  R = r * G (base point, no clamp)
    const R = crypto_scalarmult_ed25519_base_noclamp(r);

    // h = hash(R || pubKey || msg) mod q
    const h = crypto_core_ed25519_scalar_reduce(
      sha512(Buffer.concat([R, publicKey, data]))
    );

    // \(5): S = (r + h * k) mod q
    const S = crypto_core_ed25519_scalar_add(
      r,
      crypto_core_ed25519_scalar_mul(h, scalar)
    );

    return Buffer.concat([R, S]);
  }

  /**
   * Sign Algorand transaction
   * @param context
   * - context of the key (i.e Address, Identity)
   * @param account
   * - account number. This value will be hardened as part of BIP44
   * @param keyIndex
   * - key index. This value will be a SOFT derivation as part of BIP44.
   * @param prefixEncodedTx
   * - Encoded transaction object
   * @param derivationType
   * - BIP32 derivation type, defines if it's standard Ed25519 or Peikert's ammendment to BIP32-Ed25519
   *
   * @returns sig
   * - Raw bytes signature
   */
  async signAlgoTransaction(
    rootKey: Uint8Array,
    context: KeyContext,
    account: number,
    keyIndex: number,
    prefixEncodedTx: Uint8Array,
    derivationType: BIP32DerivationType = BIP32DerivationType.Peikert
  ): Promise<Uint8Array> {
    const bip44Path: number[] = GetBIP44PathFromContext(
      context,
      account,
      keyIndex
    );

    const sig = await this.rawSign(
      rootKey,
      bip44Path,
      prefixEncodedTx,
      derivationType
    );

    return sig;
  }
}
