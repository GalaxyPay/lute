import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// messaging.ts keeps the pinned dapp origin in module state, so each test
// loads a fresh copy against its own fake window.
async function load(opener: unknown) {
  vi.resetModules();
  vi.stubGlobal("window", { opener });
  const m = await import("@/utils/messaging");
  // After the import: Vue's runtime-dom probes `document` at load time.
  vi.stubGlobal("document", { referrer: "https://dapp.example/page" });
  return m;
}

const READY = { action: "ready", debug: false };

describe("dapp link detection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("flags a missing opener (COOP-severed or opened directly)", async () => {
    const m = await load(null);
    m.postReady(READY);
    expect(m.dappLinkProblem.value).toBe("missing");
  });

  it("flags an opener that never sends a request", async () => {
    const opener = { postMessage: vi.fn() };
    const m = await load(opener);
    m.postReady(READY);
    expect(opener.postMessage).toHaveBeenCalledWith(
      READY,
      "https://dapp.example"
    );
    vi.advanceTimersByTime(m.DAPP_SILENT_MS - 1);
    expect(m.dappLinkProblem.value).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(m.dappLinkProblem.value).toBe("silent");
  });

  it("stays quiet when the request arrives in time", async () => {
    const opener = { postMessage: vi.fn() };
    const m = await load(opener);
    m.postReady(READY);
    const event = { source: opener, origin: "https://dapp.example" };
    expect(m.isFromOpener(event as unknown as MessageEvent)).toBe(true);
    vi.advanceTimersByTime(m.DAPP_SILENT_MS);
    expect(m.dappLinkProblem.value).toBeUndefined();
  });

  it("clears the silent warning when a late request lands", async () => {
    const opener = { postMessage: vi.fn() };
    const m = await load(opener);
    m.postReady(READY);
    vi.advanceTimersByTime(m.DAPP_SILENT_MS);
    expect(m.dappLinkProblem.value).toBe("silent");
    const event = { source: opener, origin: "https://dapp.example" };
    expect(m.isFromOpener(event as unknown as MessageEvent)).toBe(true);
    expect(m.dappLinkProblem.value).toBeUndefined();
  });

  it("ignores messages from other windows", async () => {
    const opener = { postMessage: vi.fn() };
    const m = await load(opener);
    m.postReady(READY);
    const event = { source: {}, origin: "https://evil.example" };
    expect(m.isFromOpener(event as unknown as MessageEvent)).toBe(false);
    vi.advanceTimersByTime(m.DAPP_SILENT_MS);
    expect(m.dappLinkProblem.value).toBe("silent");
  });
});
