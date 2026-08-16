import Sync from "@/services/Sync";
import type { FalconSeedData, PasswordVerifier, SeedData } from "@/types";
import { modelsv2 } from "algosdk";
import { type DBSchema, type StoreKey, type StoreNames, openDB } from "idb";

interface LuteDB extends DBSchema {
  app: {
    key: string;
    value: any;
  };
  "assets-betanet": {
    key: number;
    value: modelsv2.Asset;
  };
  "assets-mainnet": {
    key: number;
    value: modelsv2.Asset;
  };
  "assets-testnet": {
    key: number;
    value: modelsv2.Asset;
  };
  "assets-voi mainnet": {
    key: number;
    value: modelsv2.Asset;
  };
  "assets-voi testnet": {
    key: number;
    value: modelsv2.Asset;
  };
  keys: {
    key: string;
    value: CryptoKey;
  };
  seeds: {
    key: number;
    value: SeedData;
  };
  "falcon25-seeds": {
    key: string;
    value: FalconSeedData;
  };
}

const dbLute = openDB<LuteDB>("lute", 3, {
  async upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("app");
      db.createObjectStore("assets-betanet", { keyPath: "index" });
      db.createObjectStore("assets-mainnet", { keyPath: "index" });
      db.createObjectStore("assets-testnet", { keyPath: "index" });
      db.createObjectStore("assets-voi testnet", { keyPath: "index" });
      db.createObjectStore("keys");
      db.createObjectStore("seeds", {
        keyPath: "id",
        autoIncrement: true,
      });
    }
    if (oldVersion < 2) {
      db.createObjectStore("assets-voi mainnet", { keyPath: "index" });
    }
    if (oldVersion < 3) {
      db.createObjectStore("falcon25-seeds");
    }
  },
});

export async function get(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>>
) {
  return (await dbLute).get(storeName, key);
}

export async function getAll(storeName: StoreNames<LuteDB>) {
  return (await dbLute).getAll(storeName);
}

/**
 * Whether a write to this store invalidates what other contexts hold in their
 * Pinia cache. The assets-* stores are deliberately excluded: assetInfo writes
 * them continuously while a refresh runs, and nothing reads them through the
 * cache, so bumping for those would be a getCache storm.
 */
function cached(storeName: StoreNames<LuteDB>) {
  return (
    storeName === "app" ||
    storeName === "seeds" ||
    storeName === "falcon25-seeds" ||
    storeName === "keys"
  );
}

export async function set(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>> | undefined,
  val: any
) {
  const res = await (await dbLute).put(storeName, val, key);
  if (cached(storeName)) await Sync.bump();
  return res;
}

export async function del(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>>
) {
  await (await dbLute).delete(storeName, key);
  if (cached(storeName)) await Sync.bump();
}

export async function keys(storeName: StoreNames<LuteDB>) {
  return (await dbLute).getAllKeys(storeName);
}

/** Whether two key sets match, order-independent. */
function sameKeys<T>(current: T[], expected: T[]) {
  const a = [...current].sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((k, ix) => k === b[ix]);
}

/**
 * Write every re-encrypted seed and the new password verifier in one
 * transaction, for password rotation.
 *
 * Callers must finish all encryption BEFORE calling this. An IndexedDB
 * transaction auto-commits as soon as the event loop yields with no pending
 * request, so awaiting crypto.subtle between these puts would abort it.
 */
export async function rotateAtomic(
  rewritten: { seeds: SeedData[]; falcon25: FalconSeedData[] },
  verifier: PasswordVerifier,
  expected: { ids: number[]; addresses: string[] }
) {
  const tx = (await dbLute).transaction(
    ["seeds", "falcon25-seeds", "app"],
    "readwrite"
  );
  const seedStore = tx.objectStore("seeds");
  const falconStore = tx.objectStore("falcon25-seeds");
  const currentIds = (await seedStore.getAll())
    .filter((s) => s.data)
    .map((s) => s.id);
  const currentAddrs = await falconStore.getAllKeys();
  if (
    !sameKeys(currentIds, expected.ids) ||
    !sameKeys(currentAddrs, expected.addresses)
  ) {
    tx.abort();
    throw Error("Seeds changed during rotation. Try again.");
  }
  for (const sd of rewritten.seeds) seedStore.put(sd);
  for (const sd of rewritten.falcon25) falconStore.put(sd, sd.id);
  tx.objectStore("app").put(verifier, "password");
  await tx.done;
  await Sync.bump();
}

export default dbLute;
