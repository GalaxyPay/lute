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

describe("sync relay edges", () => {
  function inbox(p: End) {
    const got: any[] = [];
    p.onMessage.addListener((m) => got.push(m));
    return got;
  }

  /** Whether the relay will start a new session now. */
  async function isFree(r: ReturnType<typeof relay>["relay"]) {
    const probe = chromePorts("lute-sync-ext");
    const got = inbox(probe.page);
    r.internal(probe.bg);
    await later(10);
    probe.page.disconnect();
    await later(10);
    return got[0]?.t === "token";
  }

  it("falls back to the sender URL for the origin", async () => {
    const { relay: r, openReceiver } = relay();
    r.external(
      chromePorts("lute-sync", { url: `${ORIGIN}/sync?x=1`, tab: { id: 4 } }).bg
    );
    expect(openReceiver).toHaveBeenCalledWith(4);

    const { relay: r2, openReceiver: open2 } = relay();
    const bad = chromePorts("lute-sync", { url: "not a url", tab: { id: 4 } });
    r2.external(bad.bg);
    const none = chromePorts("lute-sync", { tab: { id: 4 } });
    r2.external(none.bg);
    await later(10);
    expect(open2).not.toHaveBeenCalled();
    expect(bad.page.disconnected).toBe(true);
    expect(none.page.disconnected).toBe(true);
  });

  it("drops a web port with no tab or an unknown name", async () => {
    const { relay: r, openReceiver } = relay();
    const noTab = chromePorts("lute-sync", { origin: ORIGIN });
    const odd = chromePorts("lute-other", { origin: ORIGIN, tab: { id: 1 } });
    r.external(noTab.bg);
    r.external(odd.bg);
    await later(10);
    expect(noTab.page.disconnected).toBe(true);
    expect(odd.page.disconnected).toBe(true);
    expect(openReceiver).not.toHaveBeenCalled();
    expect(await isFree(r)).toBe(true);
  });

  it("refuses a second web sync while one waits", async () => {
    const { relay: r, openReceiver } = relay();
    r.external(chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 1 } }).bg);
    const second = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 2 } });
    const got = inbox(second.page);
    r.external(second.bg);
    await later(10);
    expect(got[0]).toMatchObject({ t: "error", code: "busy" });
    expect(openReceiver).toHaveBeenCalledTimes(1);
  });

  it("tells the web app when the receiver window cannot open", async () => {
    const { relay: r } = relay(vi.fn().mockRejectedValue(Error("no panel")));
    const web = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 1 } });
    const got = inbox(web.page);
    r.external(web.bg);
    await later(20);
    expect(got[0]).toMatchObject({ t: "error", code: "failed" });
    expect(web.page.disconnected).toBe(true);
    expect(await isFree(r)).toBe(true);
  });

  it("refuses a receiver page with no sync waiting for its tab", async () => {
    const { relay: r } = relay();
    r.external(chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 1 } }).bg);
    const panel = chromePorts("lute-sync-receiver:2");
    const got = inbox(panel.page);
    expect(r.internal(panel.bg)).toBe(true);
    await later(10);
    expect(got[0]).toMatchObject({ t: "error", code: "invalid" });
  });

  it("releases the web app when its receiver window closes unconnected", async () => {
    const { relay: r } = relay();
    const web = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 1 } });
    const got = inbox(web.page);
    r.external(web.bg);
    r.receiverClosed(1, Date.now());
    await later(10);
    expect(got[0]).toMatchObject({ t: "error", code: "closed" });
    expect(web.page.disconnected).toBe(true);
    expect(await isFree(r)).toBe(true);
  });

  it("leaves a later sync alone when an earlier receiver window closes", async () => {
    const { relay: r } = relay();
    const openedAt = Date.now() - 1_000;
    const web = chromePorts("lute-sync", { origin: ORIGIN, tab: { id: 1 } });
    const got = inbox(web.page);
    r.external(web.bg);
    r.receiverClosed(1, openedAt);
    await later(10);
    expect(got).toEqual([]);
    expect(web.page.disconnected).toBe(false);
  });

  it("is free again when a waiting port closes before pairing", async () => {
    const { relay: r } = relay();
    const ext = chromePorts("lute-sync-ext");
    r.internal(ext.bg);
    ext.page.disconnect();
    await later(10);
    const late = chromePorts("lute-sync:tok1", { origin: ORIGIN });
    const got = inbox(late.page);
    r.external(late.bg);
    await later(10);
    expect(got[0]).toMatchObject({ t: "error", code: "invalid" });
    expect(await isFree(r)).toBe(true);
  });

  it("passes only sync messages, and ends both sides together", async () => {
    const { relay: r } = relay();
    const ext = chromePorts("lute-sync-ext");
    r.internal(ext.bg);
    await later(10);
    // Sent before the web page connects: held, except what is not sync.
    ext.page.postMessage({ t: "hello", pub: "a" });
    ext.page.postMessage({ t: "token", token: "forged" });
    await later(10);
    const web = chromePorts("lute-sync:tok1", { origin: ORIGIN });
    const toWeb = inbox(web.page);
    r.external(web.bg);
    const toExt = inbox(ext.page);
    web.page.postMessage({ t: "hello", pub: "b" });
    web.page.postMessage({ t: "anything" });
    ext.page.postMessage({ t: "payload", data: "x" });
    await later(20);
    expect(toWeb).toEqual([
      { t: "hello", pub: "a" },
      { t: "payload", data: "x" },
    ]);
    expect(toExt).toEqual([{ t: "hello", pub: "b" }]);
    expect(await isFree(r)).toBe(false);

    web.page.disconnect();
    await later(20);
    expect(ext.page.disconnected).toBe(true);
    expect(await isFree(r)).toBe(true);
  });
});
