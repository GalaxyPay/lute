/**
 * Local signing for every account kind that holds a secret in this browser.
 * Ledger stays in utils/signers.ts; everything else resolves here, in order:
 * passkey, keystore, then the @legacy-read 1.x stores.
 */
import { get } from "@/dbLute";
import { isLocalSecret } from "@/services/accountSecret";
import HdWallet from "@/services/HdWallet";
import Keystore from "@/services/Keystore";
import Seed from "@/services/Seed";
import Unlock from "@/services/Unlock";
import type {
  AccountInfo,
  FalconSeedData,
  KeystoreRecord,
  MasterKey,
  SeedData,
} from "@/types";
import { ed25519Sign, isBadPassword } from "@/utils/keys";
import algosdk, {
  type Address,
  type Falcon1024SigningKey,
  type TransactionSigner,
} from "algosdk";
import { generateKey, signCompressed } from "falcon-1024";

/**
 * State for one signing request: the password if one was typed, the master key
 * once obtained, and decrypted signing material so a group signs with each
 * secret decrypted once. dispose() zeroes all of it.
 */
export class SignContext {
  pass?: string;
  private mk?: MasterKey;
  private material = new Map<string, Uint8Array>();
  private falcon = new Map<
    string,
    { address: Address; txnSigner: TransactionSigner }
  >();

  constructor(pass?: string) {
    this.pass = pass;
  }

  async masterKey() {
    this.mk ??= await Keystore.getMk(this.pass);
    return this.mk;
  }

  async cached(key: string, load: () => Promise<Uint8Array>) {
    let m = this.material.get(key);
    if (!m) {
      m = await load();
      this.material.set(key, m);
    }
    return m;
  }

  falconSigner(addr: string) {
    return this.falcon.get(addr);
  }

  setFalconSigner(
    addr: string,
    signer: { address: Address; txnSigner: TransactionSigner }
  ) {
    this.falcon.set(addr, signer);
  }

  dispose() {
    for (const m of this.material.values()) m.fill(0);
    this.material.clear();
    this.falcon.clear();
    this.mk = undefined;
  }
}

/** @legacy-read Sign with a 1.x non-extractable Algo25 CryptoKey. */
export async function hotSign(addr: string, bytes: Uint8Array) {
  const privateKey: CryptoKey | undefined = await get("keys", addr);
  if (!privateKey) throw Error("Account Not Found", { cause: 4300 });
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    Buffer.from(bytes)
  );
  return new Uint8Array(sig);
}

async function fromKeystore(ctx: SignContext, rec: KeystoreRecord) {
  const pt = await Keystore.decryptRecord(await ctx.masterKey(), rec);
  try {
    return Keystore.signingMaterial(rec.kind, rec.form, pt);
  } finally {
    pt.fill(0);
  }
}

/**
 * @legacy-read A 1.x seed record still in its old store. With a password in
 * hand, first try it as the wallet password: that runs the migration, after
 * which the seed reads from the keystore. A record that stayed behind is under
 * a different password, so decrypt it directly with what was typed.
 */
async function fromLegacy(
  ctx: SignContext,
  sd: SeedData | FalconSeedData,
  id: string
) {
  if (!ctx.pass) throw Error("Password Required");
  try {
    await ctx.masterKey();
  } catch (err) {
    if (!isBadPassword(err)) throw err;
  }
  const rec: KeystoreRecord | undefined = await get("keystore", id);
  if (rec) return await fromKeystore(ctx, rec);
  return new Uint8Array(await Seed.decryptSeed(ctx.pass, sd));
}

async function hdSeed(acct: AccountInfo, ctx: SignContext) {
  const id = `bip39:${acct.seedId}`;
  return await ctx.cached(id, async () => {
    const sd: SeedData | undefined = await get("seeds", acct.seedId!);
    if (sd?.credentialId)
      return new Uint8Array((await Seed.getPasskeySeed(sd.credentialId)).seed);
    const rec: KeystoreRecord | undefined = await get("keystore", id);
    if (rec) return await fromKeystore(ctx, rec);
    if (sd?.data) return await fromLegacy(ctx, sd, id);
    throw Error("Invalid Seed");
  });
}

async function falconKeySeed(acct: AccountInfo, ctx: SignContext) {
  const id = `falcon25:${acct.addr}`;
  return await ctx.cached(id, async () => {
    const rec: KeystoreRecord | undefined = await get("keystore", id);
    if (rec) return await fromKeystore(ctx, rec);
    const sd: FalconSeedData | undefined = await get(
      "falcon25-seeds",
      acct.addr
    );
    if (sd?.data) return await fromLegacy(ctx, sd, id);
    throw Error("Invalid Seed");
  });
}

const Signer = {
  /** Ed25519 signature over `bytes` for an HD or Algo25 account. */
  async signBytes(acct: AccountInfo, bytes: Uint8Array, ctx: SignContext) {
    if (acct.seedId && acct.slot != null) {
      const seed = await hdSeed(acct, ctx);
      // HdWallet.sign zeroes what it is given; keep the cached copy intact.
      return await HdWallet.sign(
        Buffer.from(seed),
        acct.slot,
        bytes,
        acct.info?.addrIdx
      );
    }
    if (acct.isFalcon25)
      throw Error("Falcon accounts cannot produce an ed25519 signature");
    const id = `algo25:${acct.addr}`;
    const rec: KeystoreRecord | undefined = await get("keystore", id);
    if (rec) {
      const seed = await ctx.cached(id, () => fromKeystore(ctx, rec));
      return await ed25519Sign(seed, bytes);
    }
    // @legacy-read The key itself needs no unwrapping, but it is a local
    // secret like any other: the wallet password gates it.
    await ctx.masterKey();
    return await hotSign(acct.addr, bytes);
  },

  /**
   * Falcon-1024 (compressed) signature over raw `bytes` for a Falcon account,
   * with the public key it verifies under.
   */
  async signFalconBytes(acct: AccountInfo, bytes: Uint8Array, ctx: SignContext) {
    if (!acct.isFalcon25) throw Error("Not a Falcon account");
    const keySeed = await falconKeySeed(acct, ctx);
    const { publicKey, privateKey } = generateKey(keySeed);
    try {
      return { publicKey, signature: signCompressed(privateKey, bytes) };
    } finally {
      privateKey.fill(0);
    }
  },

  /** A transaction signer for a Falcon-1024 account. */
  async falconSigner(acct: AccountInfo, ctx: SignContext) {
    const existing = ctx.falconSigner(acct.addr);
    if (existing) return existing;
    const keySeed = await falconKeySeed(acct, ctx);
    const { publicKey, privateKey } = generateKey(keySeed);
    const signingKey: Falcon1024SigningKey = {
      falcon1024PublicKey: publicKey,
      falcon1024Signer: async (bytesToSign: Uint8Array) =>
        signCompressed(privateKey, bytesToSign),
    };
    const signer =
      algosdk.addressWithSignersFromRawFalcon1024Signer(signingKey);
    ctx.setFalconSigner(acct.addr, signer);
    return signer;
  },

  /**
   * Whether signing as these accounts needs a password prompt first.
   * - none: no local secret involved, or the wallet is in device mode
   * - unlocked: password mode with a live session unlock
   * - password: prompt, then sign with what was typed
   */
  async gate(accts: AccountInfo[]): Promise<"none" | "unlocked" | "password"> {
    const local = accts.filter((a) => isLocalSecret(a.secret));
    if (!local.length) return "none";
    // A seed left behind under its own password always needs that password.
    if (local.some((a) => a.secret === "legacy-seed")) return "password";
    if ((await Keystore.mode()) === "device") return "none";
    const h = await Keystore.header();
    if (h && (await Unlock.get(h.id))) return "unlocked";
    return "password";
  },
};

export default Signer;
