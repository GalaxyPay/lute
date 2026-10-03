// Pure classification of where an account's signing secret lives. No store or
// database access, so the Pinia getter, the sign gate, backup and the tests all
// share one definition.
import type {
  FalconSeedData,
  KeystoreKind,
  KeystoreMeta,
  LuteAccount,
  SecretStatus,
  SeedData,
} from "@/types";

export interface SecretContext {
  keys: string[];
  seeds: SeedData[];
  falcon25Seeds: FalconSeedData[];
  keystore: KeystoreMeta[];
}

type AccountRef = Pick<LuteAccount, "addr" | "seedId" | "slot" | "appId">;

export function isHd(acct: AccountRef) {
  return !!acct.seedId && acct.slot != null;
}

/** The keystore id an account's secret is (or would be) stored under. */
export function keystoreId(kind: KeystoreKind, acct: AccountRef) {
  return kind === "bip39" ? `bip39:${acct.seedId}` : `${kind}:${acct.addr}`;
}

/** The secret kind of an account that holds one locally, else undefined. */
export function secretKind(
  acct: AccountRef,
  c: SecretContext
): KeystoreKind | undefined {
  if (acct.appId) return undefined;
  if (isHd(acct)) {
    const sd = c.seeds.find((s) => s.id === acct.seedId);
    return sd?.credentialId ? undefined : "bip39";
  }
  if (acct.slot != null) return undefined;
  const has = (kind: KeystoreKind) =>
    c.keystore.some((k) => k.id === keystoreId(kind, acct));
  if (has("falcon25") || c.falcon25Seeds.some((s) => s.id === acct.addr))
    return "falcon25";
  if (has("algo25") || c.keys.includes(acct.addr)) return "algo25";
  return undefined;
}

export function secretStatus(
  acct: AccountRef,
  c: SecretContext
): SecretStatus {
  if (acct.appId) return "none";
  if (isHd(acct)) {
    const sd = c.seeds.find((s) => s.id === acct.seedId);
    if (sd?.credentialId) return "passkey";
    const rec = c.keystore.find((k) => k.id === keystoreId("bip39", acct));
    if (rec) return rec.form === "entropy" ? "keystore" : "keystore-opaque";
    return sd?.data ? "legacy-seed" : "none";
  }
  if (acct.slot != null) return "ledger";
  const falcon = c.keystore.find(
    (k) => k.id === keystoreId("falcon25", acct)
  );
  if (falcon) return falcon.form === "seed" ? "keystore" : "keystore-opaque";
  if (c.falcon25Seeds.some((s) => s.id === acct.addr)) return "legacy-seed";
  if (c.keystore.some((k) => k.id === keystoreId("algo25", acct)))
    return "keystore";
  if (c.keys.includes(acct.addr)) return "legacy-key";
  return "none";
}

/** Statuses that hold a secret in this browser, so signing is gated. */
export function isLocalSecret(status: SecretStatus) {
  return (
    status === "keystore" ||
    status === "keystore-opaque" ||
    status === "legacy-seed" ||
    status === "legacy-key"
  );
}

/** Statuses whose mnemonic can only be exported after it is re-entered. */
export function isUpgradeable(status: SecretStatus) {
  return (
    status === "keystore-opaque" ||
    status === "legacy-seed" ||
    status === "legacy-key"
  );
}
