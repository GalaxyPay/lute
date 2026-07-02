import { sha512_256 } from "@noble/hashes/sha2.js";
import {
  addressWithSignersFromRawFalcon1024Signer,
  FALCON_1024_SCHEME,
  seedFromMnemonic,
  type Falcon1024SigningKey,
} from "algosdk";
import { generateKey, signCompressed } from "falcon-1024";

const Falcon25 = {
  pq25WordMnemonicToSeed(mn: string): Uint8Array {
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
  keyPair(mn: string) {
    return generateKey(this.pq25WordMnemonicToSeed(mn));
  },
  signingKey(keyPair: {
    publicKey: Uint8Array<ArrayBufferLike>;
    privateKey: Uint8Array;
  }) {
    const falconSigningKey: Falcon1024SigningKey = {
      falcon1024PublicKey: keyPair.publicKey,
      falcon1024Signer: async (bytesToSign: Uint8Array) =>
        signCompressed(keyPair.privateKey, bytesToSign),
    };
    return falconSigningKey;
  },
  keyPairWithAddress(mn: string) {
    const keyPair = this.keyPair(mn);
    const falconSigningKey = this.signingKey(keyPair);
    const { address } =
      addressWithSignersFromRawFalcon1024Signer(falconSigningKey);
    return { ...keyPair, address };
  },
  keyPairWithAddressFromSeed(seed: Uint8Array) {
    const keyPair = generateKey(seed);
    const falconSigningKey = this.signingKey(keyPair);
    const { address } =
      addressWithSignersFromRawFalcon1024Signer(falconSigningKey);
    return { ...keyPair, address };
  },
};

export default Falcon25;
