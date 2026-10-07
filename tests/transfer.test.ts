// Transfer.addPayload against payloads a well-behaved sender never builds.
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import type { TransferPayload } from "@/services/Transfer";
import { FALCON_MN, falconAddress } from "./fixtures/v3db";
import { fresh } from "./helpers";

const HOT = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(31));
const HOT_ADDR = algosdk.mnemonicToSecretKey(HOT).addr.toString();
const OTHER = algosdk.mnemonicFromSeed(new Uint8Array(32).fill(32));
const FALCON_ADDR = falconAddress(FALCON_MN).addr;

/** A payload from a wallet holding one Algo25 and one Falcon account. */
async function sent(): Promise<TransferPayload> {
  const env = await fresh();
  const { Keystore, Transfer } = env;
  const mk = await Keystore.getMk();
  await Keystore.storeMnemonic(mk, "algo25", HOT, {
    id: `algo25:${HOT_ADDR}`,
    accounts: (cur) => [...cur, { addr: HOT_ADDR }],
  });
  await Keystore.storeMnemonic(mk, "falcon25", FALCON_MN, {
    id: `falcon25:${FALCON_ADDR}`,
    accounts: (cur) => [...cur, { addr: FALCON_ADDR }],
  });
  return await Transfer.buildPayload(mk, { from: "web", appVersion: "t" });
}

/** The exportable plaintext of a mnemonic, as a payload carries it. */
async function plaintext(kind: "algo25" | "falcon25", mn: string) {
  const { plaintextFromMnemonic } = await import("@/services/Keystore");
  return plaintextFromMnemonic(kind, mn).plaintext.toBase64();
}

async function receive(payload: TransferPayload) {
  const env = await fresh();
  const result = await env.Transfer.addPayload(
    await env.Keystore.getMk(),
    payload
  );
  const accounts: any[] = (await env.db.get("app", "accounts")) ?? [];
  const ids = ((await env.db.getAll("keystore")) as any[]).map((r) => r.id);
  return { result, addrs: accounts.map((a) => a.addr), ids };
}

describe("fresh secrets must sign for their account", () => {
  it("adds accounts whose keys match", async () => {
    const { result, addrs, ids } = await receive(await sent());
    expect(result.added).toBe(2);
    expect(addrs.sort()).toEqual([HOT_ADDR, FALCON_ADDR].sort());
    expect(ids.sort()).toEqual(
      [`algo25:${HOT_ADDR}`, `falcon25:${FALCON_ADDR}`].sort()
    );
  });

  it("skips an Algo25 account carrying someone else's key", async () => {
    const payload = await sent();
    const s = payload.secrets.find((x) => x.kind === "algo25")!;
    s.data = await plaintext("algo25", OTHER);

    const { result, addrs, ids } = await receive(payload);

    expect(addrs).toEqual([FALCON_ADDR]);
    expect(ids).toEqual([`falcon25:${FALCON_ADDR}`]);
    expect(result.added).toBe(1);
    expect(result.skipped).toContainEqual({
      addr: HOT_ADDR,
      reason: "Its key does not match its address",
    });
  });

  it("skips a Falcon account carrying an ed25519 key", async () => {
    const payload = await sent();
    const s = payload.secrets.find((x) => x.kind === "falcon25")!;
    // Right length for a falcon seed record, wrong key.
    const other = Uint8Array.fromBase64(s.data);
    other.fill(5);
    s.data = other.toBase64();

    const { result, addrs } = await receive(payload);

    expect(addrs).toEqual([HOT_ADDR]);
    expect(result.skipped).toContainEqual({
      addr: FALCON_ADDR,
      reason: "Its key does not match its address",
    });
  });

  it("skips a secret of the wrong length instead of failing the sync", async () => {
    const payload = await sent();
    payload.secrets.find((x) => x.kind === "algo25")!.data = new Uint8Array(
      31
    ).toBase64();

    const { result, addrs } = await receive(payload);

    expect(addrs).toEqual([FALCON_ADDR]);
    expect(result.skipped.map((x) => x.addr)).toContain(HOT_ADDR);
  });
});
