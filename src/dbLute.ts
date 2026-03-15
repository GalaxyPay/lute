import type { SeedData } from "@/types";
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

export async function set(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>> | undefined,
  val: any
) {
  return (await dbLute).put(storeName, val, key);
}

export async function del(
  storeName: StoreNames<LuteDB>,
  key: StoreKey<LuteDB, StoreNames<LuteDB>>
) {
  return (await dbLute).delete(storeName, key);
}

export async function keys(storeName: StoreNames<LuteDB>) {
  return (await dbLute).getAllKeys(storeName);
}

export default dbLute;
