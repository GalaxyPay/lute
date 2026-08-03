import Sync from "@/services/Sync";
import type { PasswordVerifier, SeedData } from "@/types";
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
}

const dbLute = openDB<LuteDB>("lute", 2, {
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
  return storeName === "app" || storeName === "seeds" || storeName === "keys";
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

/**
 * Write every re-encrypted seed and the new password verifier in one
 * transaction, for password rotation.
 *
 * Callers must finish all encryption BEFORE calling this. An IndexedDB
 * transaction auto-commits as soon as the event loop yields with no pending
 * request, so awaiting crypto.subtle between these puts would abort it.
 */
export async function rotateAtomic(
  seeds: SeedData[],
  verifier: PasswordVerifier,
  expectedIds: number[]
) {
  const tx = (await dbLute).transaction(["seeds", "app"], "readwrite");
  const store = tx.objectStore("seeds");
  const current = (await store.getAll())
    .filter((s) => s.data)
    .map((s) => s.id)
    .sort();
  const expected = [...expectedIds].sort();
  if (
    current.length !== expected.length ||
    current.some((id, ix) => id !== expected[ix])
  ) {
    tx.abort();
    throw Error("Seeds changed during rotation. Try again.");
  }
  for (const sd of seeds) store.put(sd);
  tx.objectStore("app").put(verifier, "password");
  await tx.done;
  await Sync.bump();
}

export default dbLute;
