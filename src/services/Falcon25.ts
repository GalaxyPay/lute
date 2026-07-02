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
  getAddress(mn: string) {
    const seed = this.mnemonicToSeed(mn);
    const { publicKey } = generateKey(seed);
    const { address } = Address.canonicalPQAddress(
      FALCON_1024_SCHEME,
      publicKey
    );
    return address;
  },
};

export default Falcon25;
