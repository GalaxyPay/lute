import type { SyncMessage, SyncTransport } from "@/services/SyncSession";
import { IDBFactory } from "fake-indexeddb";
import { vi } from "vitest";

/**
 * A fresh module graph over a fresh, empty IndexedDB, as a browser profile
 * would see on first load. `seed` can populate the database first (to model
 * an upgrade from 1.x) before dbLute opens it.
 */
export async function fresh(seed?: () => Promise<void>) {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  if (seed) await seed();
  const kdf = await import("@/services/kdf");
  kdf.setKdfIterationsForTests(1000);
  // The same module the @/stores/app alias resolves to in vitest.config.ts.
  const { testStore } = await import("./stubs/store");
  Object.assign(testStore, {
    isWeb: true,
    autoLockMinutes: 0,
    unlocked: false,
    keystoreMode: "device",
    keys: [],
    seeds: [],
    falcon25Seeds: [],
    keystore: [],
  });
  return {
    db: await import("@/dbLute"),
    kdf,
    Keystore: (await import("@/services/Keystore")).default,
    Signer: (await import("@/services/Signer")).default,
    SignContext: (await import("@/services/Signer")).SignContext,
    Seed: (await import("@/services/Seed")).default,
    Unlock: (await import("@/services/Unlock")).default,
    Transfer: (await import("@/services/Transfer")).default,
    SyncSession: await import("@/services/SyncSession"),
    accountSecret: await import("@/services/accountSecret"),
    store: testStore,
  };
}

export type Env = Awaited<ReturnType<typeof fresh>>;

/** Load the store caches the way getCache does, for the sign gate. */
export async function loadCaches(env: Env) {
  const { db, store } = env;
  store.keys = (await db.keys("keys")) as string[];
  store.seeds = (await db.getAll("seeds")) as any;
  store.falcon25Seeds = (await db.getAll("falcon25-seeds")) as any;
  store.keystore = ((await db.getAll("keystore")) as any[]).map(
    ({ id, kind, form }) => ({ id, kind, form })
  );
  store.keystoreMode = await env.Keystore.mode();
}

/**
 * Two connected in-memory transports, standing in for the ports the background
 * relays. Like a real Port, delivery is asynchronous and in order, messages
 * sent before a close still arrive, and the other end learns of the close after
 * them.
 */
export function pairedTransports(): [SyncTransport, SyncTransport] {
  type End = {
    handler?: (m: SyncMessage) => void;
    buffered: SyncMessage[];
    onClose?: () => void;
    closed: boolean;
  };
  const shut = (e: End) => {
    if (e.closed) return;
    e.closed = true;
    e.onClose?.();
  };
  const make = (me: End, peer: End): SyncTransport => ({
    send(m) {
      if (me.closed) return;
      const copy = structuredClone(m);
      setTimeout(() => {
        if (peer.closed) return;
        if (peer.handler) peer.handler(copy);
        else peer.buffered.push(copy);
      }, 0);
    },
    onMessage(cb) {
      me.handler = cb;
      me.buffered.splice(0).forEach(cb);
    },
    onClose(cb) {
      if (me.closed) cb();
      else me.onClose = cb;
    },
    close() {
      shut(me);
      setTimeout(() => shut(peer), 0);
    },
  });
  const a: End = { buffered: [], closed: false };
  const b: End = { buffered: [], closed: false };
  return [make(a, b), make(b, a)];
}
