import { sha512_256 } from "@noble/hashes/sha2.js";
import { Address, FALCON_1024_SCHEME, seedFromMnemonic } from "algosdk";
import { generateKey } from "falcon-1024";

const Falcon25 = {
  mnemonicToSeed(mn: string): Uint8Array {
    return new Uint8Array(
      sha512_256(
        new Uint8Array([
          ...Buffer.from("PQK"),
          ...FALCON_1024_SCHEME,
          ...seedFromMnemonic(mn),
        ])
      )
    );
  },
  getAddress(falcon1024PublicKey: Uint8Array) {
    const { address } = Address.canonicalPQAddress(
      FALCON_1024_SCHEME,
      falcon1024PublicKey
    );
    return address;
  },
  keyPairWithAddress(seed: Uint8Array) {
    const keyPair = generateKey(seed);
    const address = this.getAddress(keyPair.publicKey);
    return { ...keyPair, address };
  },
};

export default Falcon25;
