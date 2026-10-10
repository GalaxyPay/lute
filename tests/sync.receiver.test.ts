// The receiver against a scripted sender that misbehaves: every refusal must
// tell the sender why and write nothing to the receiving wallet.
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import type { SyncMessage, SyncTransport } from "@/services/SyncSession";
import { type Env, fresh, pairedTransports } from "./helpers";

const HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(21));
const HOT_ADDR = algosdk.mnemonicToSecretKey(HOT).addr.toString();

/** One end of a session, driven step by step by the test. */
function scripted(t: SyncTransport) {
  const inbox: SyncMessage[] = [];
  const waiters: (() => void)[] = [];
  t.onMessage((m) => {
    inbox.push(m);
    waiters.splice(0).forEach((w) => w());
  });
  return {
    sent: inbox,
    async next(): Promise<SyncMessage> {
      while (!inbox.length) await new Promise<void>((r) => waiters.push(r));
      return inbox.shift()!;
    },
    send: (m: SyncMessage) => t.send(m),
  };
}

/** A sender that completes the handshake, then waits for `confirmed`. */
async function handshake(env: Env, peer: ReturnType<typeof scripted>) {
  const S = env.SyncSession;
  const { privateKey, pub } = await S.createKeys();
  peer.send({ t: "hello", pub: pub.toBase64() });
  const hello = await peer.next();
  if (hello.t !== "hello") throw Error(`expected hello, got ${hello.t}`);
  const webPub = Uint8Array.fromBase64(hello.pub);
  const key = await S.deriveSessionKey(privateKey, webPub, webPub, pub);
  const confirmed = await peer.next();
  expect(confirmed.t).toBe("confirmed");
  return key;
}

/**
 * A real payload carrying one account, built in a separate wallet. Call it
 * before receiver(): fresh() swaps the global IndexedDB.
 */
async function payloadFrom(from: "web" | "ext") {
  const other = await fresh();
  const mk = await other.Keystore.getMk();
  await other.Keystore.storeMnemonic(mk, "algo25", HOT, {
    id: `algo25:${HOT_ADDR}`,
    accounts: (cur) => [...cur, { addr: HOT_ADDR }],
  });
  return {
    payload: await other.Transfer.buildPayload(mk, { from, appVersion: "t" }),
    seal: other.SyncSession.seal,
  };
}

async function receiver(timeoutMs = 5_000) {
  const env = await fresh();
  const [mine, theirs] = pairedTransports();
  const peer = scripted(theirs);
  const run = env.SyncSession.runReceiver("web", mine, {
    confirm: async () => true,
    getMk: () => env.Keystore.getMk(),
    timeoutMs,
  });
  // Surface the rejection only when the test awaits it.
  run.catch(() => {});
  return { env, peer, run };
}

async function accounts(env: Env) {
  return {
    accounts: (await env.db.get("app", "accounts")) ?? [],
    keystore: await env.db.getAll("keystore"),
  };
}

async function lastError(peer: ReturnType<typeof scripted>) {
  for (;;) {
    const m = await peer.next();
    if (m.t === "error") return m;
  }
}

describe("receiver refuses a bad sender", () => {
  it("a payload that fails to decrypt", async () => {
    const { payload, seal } = await payloadFrom("ext");
    const { env, peer, run } = await receiver();
    const key = await handshake(env, peer);
    const data = Uint8Array.fromBase64(await seal("ext", payload, key));
    data[data.length - 1]! ^= 1;
    peer.send({ t: "payload", data: data.toBase64() });

    await expect(run).rejects.toMatchObject({ code: "invalid" });
    expect(await lastError(peer)).toMatchObject({ code: "invalid" });
    expect(await accounts(env)).toEqual({ accounts: [], keystore: [] });
  });

  it("a payload sealed as coming from the receiver's own side", async () => {
    const { payload, seal } = await payloadFrom("web");
    const { env, peer, run } = await receiver();
    const key = await handshake(env, peer);
    // Sealed with the receiver's own direction, so its AAD does not match.
    peer.send({ t: "payload", data: await seal("web", payload, key) });

    await expect(run).rejects.toMatchObject({ code: "invalid" });
    expect(await accounts(env)).toEqual({ accounts: [], keystore: [] });
  });

  it("a payload whose sender field disagrees with its seal", async () => {
    const { payload, seal } = await payloadFrom("web");
    const { env, peer, run } = await receiver();
    const key = await handshake(env, peer);
    peer.send({ t: "payload", data: await seal("ext", payload, key) });

    await expect(run).rejects.toMatchObject({
      code: "invalid",
      message: expect.stringContaining("could not be verified"),
    });
    expect(await accounts(env)).toEqual({ accounts: [], keystore: [] });
  });

  it("a message out of order", async () => {
    const { env, peer, run } = await receiver();
    await handshake(env, peer);
    peer.send({ t: "result", added: 1, upgraded: 0, skipped: [] });

    await expect(run).rejects.toMatchObject({
      code: "invalid",
      message: "Unexpected sync message.",
    });
    expect(await lastError(peer)).toMatchObject({ code: "invalid" });
  });

  it("a hello that is not a public key", async () => {
    const { peer, run } = await receiver();
    peer.send({ t: "hello", pub: "not base64!" });

    await expect(run).rejects.toMatchObject({ code: "invalid" });
  });

  it("a sender that goes quiet", async () => {
    const { env, peer, run } = await receiver(50);
    await handshake(env, peer);

    await expect(run).rejects.toMatchObject({ code: "timeout" });
    expect(await lastError(peer)).toMatchObject({ code: "timeout" });
    expect(await accounts(env)).toEqual({ accounts: [], keystore: [] });
  });

  it("an error from the sender is not echoed back", async () => {
    const { env, peer, run } = await receiver();
    await handshake(env, peer);
    peer.send({ t: "error", code: "cancelled", message: "Stop." });

    await expect(run).rejects.toMatchObject({
      code: "cancelled",
      message: "Stop.",
      fromPeer: true,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(peer.sent.filter((m) => m.t === "error")).toEqual([]);
  });

  it("accepts the same payload sealed correctly", async () => {
    // The control for the cases above.
    const { payload, seal } = await payloadFrom("ext");
    const { env, peer, run } = await receiver();
    const key = await handshake(env, peer);
    peer.send({ t: "payload", data: await seal("ext", payload, key) });

    await expect(run).resolves.toMatchObject({ added: 1 });
    const after = await accounts(env);
    expect(after.accounts).toEqual([
      expect.objectContaining({ addr: HOT_ADDR }),
    ]);
    // Re-encrypted under the receiver's own key, so this is its database.
    const mk = await env.Keystore.getMk();
    expect(after.keystore.map((r: any) => r.id)).toEqual([`algo25:${HOT_ADDR}`]);
    await expect(
      env.Keystore.getSecret(mk, `algo25:${HOT_ADDR}`)
    ).resolves.toBeTruthy();
  });
});
