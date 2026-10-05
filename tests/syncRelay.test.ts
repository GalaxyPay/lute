import algosdk from "algosdk";
import { describe, expect, it, vi } from "vitest";
import { createSyncRelay, type RelayPort } from "@/ext/syncRelay";
import { fresh } from "./helpers";

const ORIGIN = "https://lute.app";
const HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(21));
const HOT_ADDR = algosdk.mnemonicToSecretKey(HOT).addr.toString();
const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

type End = RelayPort & { disconnected: boolean };

/**
 * A connected pair of Ports that behaves like Chrome's: delivery is
 * asynchronous, a message that arrives while no listener is attached is lost,
 * and disconnecting one end tells only the other.
 */
function chromePorts(name: string, sender?: RelayPort["sender"]) {
  const make = (): End => {
    const listeners = new Set<(m: any) => void>();
    const closers: (() => void)[] = [];
    return {
      name,
      sender,
      disconnected: false,
      postMessage: () => {},
      disconnect: () => {},
      onMessage: {
        addListener: (cb) => listeners.add(cb),
        removeListener: (cb) => listeners.delete(cb),
        // Exposed for delivery below.
        ...({ listeners } as any),
      },
      onDisconnect: { addListener: (cb) => closers.push(cb), ...({ closers } as any) },
    };
  };
  const page = make();
  const bg = make();
  const link = (from: End, to: End) => {
    from.postMessage = (m) => {
      if (from.disconnected) throw Error("Attempting to use a disconnected port");
      const copy = structuredClone(m);
      setTimeout(() => {
        if (to.disconnected) return;
        for (const l of [...(to.onMessage as any).listeners]) l(copy);
      }, 0);
    };
    from.disconnect = () => {
      if (from.disconnected) return;
      from.disconnected = true;
      setTimeout(() => {
        if (to.disconnected) return;
        to.disconnected = true;
        for (const c of (to.onDisconnect as any).closers) c();
      }, 0);
    };
  };
  link(page, bg);
  link(bg, page);
  return { page, bg };
}

async function wallets() {
  const a = await fresh();
  await a.Keystore.storeMnemonic(await a.Keystore.getMk(), "algo25", HOT, {
    id: `algo25:${HOT_ADDR}`,
    accounts: (cur) => [...cur, { addr: HOT_ADDR }],
  });
  const b = await fresh();
  const { portTransport } = await import("@/services/syncTransports");
  return { a, b, portTransport };
}

function relay(openReceiver = vi.fn(), ttlMs = 5_000) {
  let n = 0;
  return {
    openReceiver,
    relay: createSyncRelay({
      origins: [ORIGIN],
      openReceiver,
      ttlMs,
      newToken: () => `tok${++n}`,
    }),
  };
}

const hooks = { timeoutMs: 3_000 };

describe("sync relay", () => {
  it("delivers what the web app sent before the receiver page connected", async () => {
    const { a, b, portTransport } = await wallets();
    const { relay: r, openReceiver } = relay();
    const web = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 7 } });
    r.external(web.bg);
    expect(openReceiver).toHaveBeenCalledWith(7);
    // The web app says hello straight away; the side panel takes a while.
    const sent = a.SyncSession.runSender("web", portTransport(web.page), {
      ...hooks,
      appVersion: "test",
      mk: await a.Keystore.getMk(),
    });
    await later(50);
    const panel = chromePorts("lute-sync-receiver:7");
    expect(r.internal(panel.bg)).toBe(true);
    const received = b.SyncSession.runReceiver("ext", portTransport(panel.page), {
      ...hooks,
      confirm: async () => true,
      getMk: () => b.Keystore.getMk(),
    });
    const [s, rec] = await Promise.all([sent, received]);
    expect(rec.added).toBe(1);
    expect(s.added).toBe(1);
    const accounts: any[] = await b.db.get("app", "accounts");
    expect(accounts.map((x) => x.addr)).toEqual([HOT_ADDR]);
  });

  it("delivers what the extension sent before the web page connected", async () => {
    const { a, b, portTransport } = await wallets();
    const { relay: r } = relay();
    const ext = chromePorts("lute-sync-ext");
    const token = new Promise<string>((resolve) =>
      ext.page.onMessage.addListener((m: any) => m?.t === "token" && resolve(m.token))
    );
    expect(r.internal(ext.bg)).toBe(true);
    expect(await token).toBe("tok1");
    const sent = a.SyncSession.runSender("ext", portTransport(ext.page), {
      ...hooks,
      appVersion: "test",
      mk: await a.Keystore.getMk(),
    });
    await later(50);
    const web = chromePorts("lute-sync:tok1", { origin: ORIGIN, tab: { id: 3 } });
    r.external(web.bg);
    const received = b.SyncSession.runReceiver("web", portTransport(web.page), {
      ...hooks,
      confirm: async () => true,
      getMk: () => b.Keystore.getMk(),
    });
    const [, rec] = await Promise.all([sent, received]);
    expect(rec.added).toBe(1);
  });

  it("refuses a spent token, a foreign origin and a second session", async () => {
    const { relay: r, openReceiver } = relay();
    const errors = (p: End) => {
      const got: any[] = [];
      p.onMessage.addListener((m) => got.push(m));
      return got;
    };

    const ext = chromePorts("lute-sync-ext");
    r.internal(ext.bg);
    const first = chromePorts("lute-sync:tok1", { origin: ORIGIN });
    r.external(first.bg);
    const replay = chromePorts("lute-sync:tok1", { origin: ORIGIN });
    const replayMsgs = errors(replay.page);
    r.external(replay.bg);

    const foreign = chromePorts("lute-sync", {
      origin: "https://evil.example",
      tab: { id: 1 },
    });
    r.external(foreign.bg);

    const second = chromePorts("lute-sync-ext");
    const secondMsgs = errors(second.page);
    r.internal(second.bg);

    await later(20);
    expect(replayMsgs[0]).toMatchObject({ t: "error", code: "invalid" });
    expect(replay.page.disconnected).toBe(true);
    expect(foreign.page.disconnected).toBe(true);
    expect(openReceiver).not.toHaveBeenCalled();
    expect(secondMsgs[0]).toMatchObject({ t: "error", code: "busy" });
    expect(r.internal(chromePorts("luteSidepanel").bg)).toBe(false);
  });

  it("gives up on a receiver that never connects", async () => {
    const { relay: r } = relay(vi.fn(), 30);
    const web = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 9 } });
    const got: any[] = [];
    web.page.onMessage.addListener((m) => got.push(m));
    r.external(web.bg);
    await later(80);
    expect(got[0]).toMatchObject({ t: "error", code: "timeout" });
    expect(web.page.disconnected).toBe(true);
    // Free for a new session afterwards.
    const again = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 9 } });
    const msgs: any[] = [];
    again.page.onMessage.addListener((m) => msgs.push(m));
    r.external(again.bg);
    await later(10);
    expect(msgs).toEqual([]);
  });
});
