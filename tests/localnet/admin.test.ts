// ARC-55 admin actions through the in-app signer: Msig calls luteSigner, which
// hands the txns to the sign dialog and waits for its answer. A stand-in for
// the dialog (signDialog below) runs LuteTxns the way SignView does, so the
// handshake, the dialog's checks, the signer's account choice and the chain
// are all real; only the user's click and the key store are not.
import algosdk from "algosdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Deployed, deploy, payFrom, propose, sign } from "./arc55";
import { useLocalNet } from "./helpers";

// The keys the wallet holds, by address. Stands in for the keystore behind
// Signer, which signer.test.ts covers.
const held = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock("@/services/Signer", async () => {
  const { ed25519Sign } = await import("@/utils/keys");
  return {
    default: {
      async signBytes(acct: { addr: string }, bytes: Uint8Array) {
        const sk = held.get(acct.addr);
        if (!sk) throw Error(`No key for ${acct.addr}`);
        return await ed25519Sign(sk.slice(0, 32), bytes);
      },
    },
    SignContext: class {
      dispose() {}
    },
    hotSign: vi.fn(),
  };
});
vi.mock("@ledgerhq/hw-transport-webhid", () => ({ default: {} }));
vi.mock("@ledgerhq/hw-transport-webusb", () => ({ default: {} }));
vi.mock("ledger-algorand-js", () => ({ AlgorandApp: class {} }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/router", () => ({ default: router }));

const { default: Msig } = await import("@/services/Msig");

let store: any;
const snacks: [string, string][] = [];
let dialog: ReturnType<typeof signDialog> | undefined;

beforeEach(() => {
  snacks.length = 0;
  held.clear();
  router.replace.mockClear();
  // The sign dialog talks to luteSigner through window events.
  (globalThis as any).window = Object.assign(new EventTarget(), {
    close() {},
  });
  (globalThis as any).alert = vi.fn();
  store = useLocalNet({
    setSnackbar: (msg: string, color: string) => snacks.push([msg, color]),
    acctInfo: [],
    info: [],
  });
});

afterEach(() => {
  dialog?.stop();
  dialog = undefined;
});

/**
 * The sign dialog: for each request luteSigner opens, run LuteTxns as
 * SignView's in-app path does and press Sign, or close it as SignDialog does.
 */
function signDialog(answer: "sign" | "close" = "sign") {
  let running = true;
  const opened: any[] = [];
  (async () => {
    while (running) {
      const lt = store.luteTxns;
      if (lt && !opened.includes(lt)) {
        opened.push(lt);
        if (answer === "close") {
          window.dispatchEvent(
            new CustomEvent("modal-signer", { detail: { action: "close" } })
          );
          store.luteTxns = undefined;
        } else if ((await lt.validateNetwork()) && (await lt.prepare())) {
          await lt.sign();
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  })();
  return {
    opened,
    stop() {
      running = false;
    },
  };
}

const errors = () => snacks.filter(([, c]) => c === "error").map(([m]) => m);

/** An app with one stored group that two members have signed. */
async function withSignedGroup() {
  const d = await deploy();
  const txns = [await payFrom(d.msigAddr, d.admin.toString(), 1)];
  const nonce = await propose(d, d.members[0]!, txns);
  await sign(d, d.members[0]!, nonce, txns);
  await sign(d, d.members[1]!, nonce, txns);
  return { d, nonce };
}

async function group(d: Deployed, nonce: bigint) {
  return (await Msig.loadApp(d.appId))!.groups[Number(nonce) - 1]!;
}

/** Give the wallet this account's key, as an ordinary hot account. */
function holds(acct: { toString(): string; account: algosdk.Account }) {
  held.set(acct.toString(), acct.account.sk);
  store.acctInfo.push({ addr: acct.toString(), canSign: true });
}

describe("admin actions through the sign dialog", () => {
  it("a member clears their own signatures", async () => {
    const { d, nonce } = await withSignedGroup();
    const member = d.members[0]!;
    holds(member);
    dialog = signDialog();

    await Msig.clearSigs(d.appId, nonce, member.toString());

    expect(errors()).toEqual([]);
    expect(snacks).toContainEqual(["Signature(s) Removed", "success"]);
    expect(dialog.opened).toHaveLength(1);
    expect((await group(d, nonce)).sigs.map((s) => s.addr)).toEqual([
      d.members[1]!.toString(),
    ]);
  });

  it("the admin deletes a group, its signatures first", async () => {
    const { d, nonce } = await withSignedGroup();
    holds(d.admin);
    dialog = signDialog();

    await Msig.deleteGroup(d.appId, await group(d, nonce), d.admin.toString());

    expect(errors()).toEqual([]);
    expect(snacks).toContainEqual(["Group Removed", "success"]);
    const after = await group(d, nonce);
    expect(after.txns.filter(Boolean)).toEqual([]);
    expect(after.sigs).toEqual([]);
  });

  it("the admin destroys an app with no groups left", async () => {
    const { d, nonce } = await withSignedGroup();
    holds(d.admin);
    dialog = signDialog();
    await Msig.deleteGroup(d.appId, await group(d, nonce), d.admin.toString());

    await Msig.destroyApp(await Msig.loadApp(d.appId), d.admin.toString());

    expect(errors()).toEqual([]);
    expect(snacks).toContainEqual(["Multi-Sig Destroyed", "success"]);
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(await Msig.loadApp(d.appId, true)).toBeUndefined();
  });

  it("will not destroy an app that still holds a group", async () => {
    const { d } = await withSignedGroup();
    holds(d.admin);
    dialog = signDialog();

    await Msig.destroyApp(await Msig.loadApp(d.appId), d.admin.toString());

    expect(alert).toHaveBeenCalled();
    expect(dialog.opened).toEqual([]);
    expect(await Msig.loadApp(d.appId, true)).toBeDefined();
  });
});

describe("the sign dialog refusing", () => {
  it("leaves the app alone when the user closes the dialog", async () => {
    const { d, nonce } = await withSignedGroup();
    holds(d.members[0]!);
    dialog = signDialog("close");

    await Msig.clearSigs(d.appId, nonce, d.members[0]!.toString());

    expect(errors()).toEqual(["User Rejected Request"]);
    expect((await group(d, nonce)).sigs).toHaveLength(2);
  });

  it("refuses txns for a network other than the one the app is on", async () => {
    const { d, nonce } = await withSignedGroup();
    holds(d.members[0]!);
    // The wallet shows MainNet, but the txns were built for localnet.
    store.networkName = "MainNet";
    dialog = signDialog();

    await Msig.clearSigs(d.appId, nonce, d.members[0]!.toString());

    expect(errors()).toEqual(["Network Mismatch"]);
    expect((await group(d, nonce)).sigs).toHaveLength(2);
  });

  it("does not sign for an account the wallet does not hold", async () => {
    const { d, nonce } = await withSignedGroup();
    // A member, so the app would accept the call, but not one of ours.
    dialog = signDialog();

    await Msig.clearSigs(d.appId, nonce, d.members[1]!.toString());

    expect(errors()).toEqual(["Account Not Found"]);
    expect((await group(d, nonce)).sigs).toHaveLength(2);
  });
});
