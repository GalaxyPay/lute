// Browser stand-in for node:crypto, aliased in the Vite configs in place of
// vite-plugin-node-polyfills' crypto-browserify (~300 kB of elliptic, bn.js,
// asn1.js, readable-stream...). Only covers what our deps actually call:
// - @algorandfoundation/xhd-wallet-api: createHash(sha256|sha512), createHmac(sha512)
// - tweetnacl only probes `require("crypto").randomBytes` when self.crypto is
//   missing, which never happens in a browser.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

const hashes = { sha256, sha512 } as const;
type Algorithm = keyof typeof hashes;
type Data = string | Uint8Array;

function getHash(algorithm: string) {
  const h = hashes[algorithm.toLowerCase() as Algorithm];
  if (!h) throw new Error(`crypto shim: unsupported algorithm ${algorithm}`);
  return h;
}

const toBytes = (data: Data) =>
  typeof data === "string" ? new TextEncoder().encode(data) : data;

interface Digestible {
  update(data: Data): Digestible;
  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
}

function wrap(inner: {
  update(data: Uint8Array): unknown;
  digest(): Uint8Array;
}): Digestible {
  const self: Digestible = {
    update(data) {
      inner.update(toBytes(data));
      return self;
    },
    digest(encoding?: BufferEncoding) {
      const out = Buffer.from(inner.digest());
      return (encoding ? out.toString(encoding) : out) as Buffer & string;
    },
  };
  return self;
}

export function createHash(algorithm: string): Digestible {
  return wrap(getHash(algorithm).create());
}

export function createHmac(algorithm: string, key: Data): Digestible {
  return wrap(hmac.create(getHash(algorithm), toBytes(key)));
}

export function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

export default { createHash, createHmac, randomBytes };
