import Sync from "@/services/Sync";
import type {
  FalconSeedData,
  KeystoreRecord,
  LuteAccount,
  SeedData,
} from "@/types";
import { modelsv2 } from "algosdk";
import {
  type DBSchema,
  type IDBPTransaction,
  type StoreKey,
  type StoreNames,
  openDB,
} from "idb";

export const ACCOUNT_VERSION = 2;

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
  // @legacy-read: 1.x non-extractable Algo25 keys, addr -> CryptoKey.
  keys: {
    key: string;
    value: CryptoKey;
  };
  // Passkey credentials, plus @legacy-read 1.x password-encrypted bip39 seeds.
  seeds: {
    key: number;
    value: SeedData;
  };
  // @legacy-read: 1.x password-encrypted Falcon seeds, keyed by address.
  "falcon25-seeds": {
    key: string;
    value: FalconSeedData;
  };
  keystore: {
    key: string;
    value: KeystoreRecord;
  };
}

export function stampAccounts(accounts: LuteAccount[]) {
  return accounts.map((a) => (a.v ? a : { ...a, v: ACCOUNT_VERSION }));
}

const dbLute = openDB<LuteDB>("lute", 4, {
  async upgrade(db, oldVersion, _newVersion, tx) {
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
    if (oldVersion < 4) {
      // Only IndexedDB requests may be awaited here: the versionchange
      // transaction commits once the event loop yields without one, so the
      // keystore header (which needs crypto) is created later.
      db.createObjectStore("keystore");
      const app = tx.objectStore("app");
      const accounts: LuteAccount[] | undefined = await app.get("accounts");
      if (accounts) await app.put(stampAccounts(accounts), "accounts");
      // Continue the seeds store's numbering so existing seedIds stay valid.
      const seedIds = await tx.objectStore("seeds").getAllKeys();
      await app.put(Math.max(0, ...seedIds) + 1, "nextSeedId");
    }
  },
  blocked() {
    // An older build in another tab holds the v3 connection open.
    const message = "Close other Lute tabs to finish updating.";
    console.warn(`[Lute] ${message}`);
    try {
      useAppStore().setSnackbar(message, "warning", -1);
    } catch {
      // The store may not be up yet this early in loading.
    }
  },
  blocking() {
    // Reload into the newer build rather than run against a changing schema.
    dbLute.then((db) => db.close());
    globalThis.location?.reload();
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
    storeName === "keys" ||
    storeName === "keystore"
  );
}

export async function set(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>> | undefined,
  val: any
) {
  // Every account list writer goes through here, so new records are stamped.
  if (storeName === "app" && key === "accounts") val = stampAccounts(val);
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

/** Thrown from a keystoreTx body on drift. Nothing has been written. */
export class KeystoreConflict extends Error {
  constructor(message = "The wallet changed in another window. Try again.") {
    super(message);
    this.name = "KeystoreConflict";
  }
}

const KEYSTORE_TX_STORES = [
  "app",
  "keystore",
  "seeds",
  "falcon25-seeds",
  "keys",
] as const;

export type KeystoreTx = IDBPTransaction<
  LuteDB,
  typeof KEYSTORE_TX_STORES extends readonly (infer S)[] ? S[] : never,
  "readwrite"
>;

/**
 * Spans every store holding secrets or the account list, so a change lands
 * whole or not at all.
 *
 * Finish all crypto first: IndexedDB auto-commits once the event loop yields
 * with no pending request, so `body` may await only requests on `tx`. It
 * should re-read what it prepared against and throw KeystoreConflict on drift.
 */
export async function keystoreTx<T>(
  body: (tx: KeystoreTx) => Promise<T>
): Promise<T> {
  const tx = (await dbLute).transaction(
    [...KEYSTORE_TX_STORES],
    "readwrite"
  ) as KeystoreTx;
  // Observed now so an abort isn't also an unhandled rejection.
  const done = tx.done.then(
    () => undefined,
    (err) => err ?? Error("Transaction aborted")
  );
  let result: T;
  try {
    result = await body(tx);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await done;
    throw err;
  }
  const err = await done;
  if (err) throw err;
  await Sync.bump();
  return result;
}

export default dbLute;
