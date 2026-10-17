import { describe, expect, it, vi } from "vitest";
import algosdk from "algosdk";
import type { Arc55App, MsigGroup } from "@/types";

// Msig.ts loads the router and the Ledger-aware signers for its app calls;
// buildGroup needs neither.
vi.mock("@/router", () => ({ default: {} }));
vi.mock("@/utils/signers", () => ({ luteSigner: vi.fn() }));

const { default: Msig } = await import("@/services/Msig");
const { testStore } = await import("./stubs/store");

const members = [0, 1, 2].map(() => algosdk.generateAccount());
const addrs = members.map((m) => m.addr);
const mparams = { version: 1, threshold: 2, addrs };
const msigAddr = algosdk.multisigAddress(mparams);

const params: algosdk.SuggestedParams = {
  fee: 1000n,
  minFee: 1000n,
  firstValid: 1n,
  lastValid: 1000n,
  genesisID: "localnet-v1",
  genesisHash: new Uint8Array(32).fill(1),
  flatFee: true,
};

function payment(amount: number) {
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: msigAddr,
    receiver: addrs[0]!,
    amount,
    suggestedParams: params,
  });
}

function sigsFor(signer: number, txns: algosdk.Transaction[]) {
  return {
    addr: addrs[signer]!.toString(),
    sigs: txns.map((t) => t.rawSignTxn(members[signer]!.sk).toBase64()),
  };
}

function app(groups: MsigGroup[]): Arc55App {
  return {
    info: {} as Arc55App["info"],
    acct: {} as Arc55App["acct"],
    addrs: addrs as any,
    groups,
    arc55_threshold: 2n,
    arc55_nonce: BigInt(groups.length),
  };
}

function subsigs(blob: Uint8Array) {
  const st = algosdk.decodeSignedTransaction(blob);
  return st.msig!.subsig.map((s) => s.s);
}

describe("Msig.buildGroup", () => {
  it("merges each member's signatures into one multisig txn per index", async () => {
    const txns = [payment(1), payment(2)];
    const signers = [0, 2];
    const grp: MsigGroup = {
      nonce: 1n,
      txns,
      stxns: [null, null],
      sigs: signers.map((i) => sigsFor(i, txns)),
    };

    const out = await Msig.buildGroup(app([grp]), 1n);

    expect(out).toHaveLength(2);
    out.forEach((blob, idx) => {
      const st = algosdk.decodeSignedTransaction(blob);
      expect(st.txn.txID()).toBe(txns[idx]!.txID());
      expect(st.msig!.thr).toBe(2);
      const got = subsigs(blob);
      expect(got[0]).toEqual(txns[idx]!.rawSignTxn(members[0]!.sk));
      expect(got[1]).toBeUndefined();
      expect(got[2]).toEqual(txns[idx]!.rawSignTxn(members[2]!.sk));
    });
  });

  it("passes a pre-signed txn through untouched", async () => {
    const txns = [payment(1), payment(2)];
    const presigned = algosdk.signTransaction(
      txns[1]!,
      algosdk.generateAccount().sk
    ).blob;
    const grp: MsigGroup = {
      nonce: 1n,
      txns,
      stxns: [null, presigned.toBase64()],
      sigs: [sigsFor(0, txns), sigsFor(1, txns)],
    };

    const out = await Msig.buildGroup(app([grp]), 1n);

    expect(out[1]).toEqual(presigned);
    expect(subsigs(out[0]!).filter(Boolean)).toHaveLength(2);
  });

  it("returns a single member's signature without merging", async () => {
    const txns = [payment(1)];
    const grp: MsigGroup = {
      nonce: 1n,
      txns,
      stxns: [null],
      sigs: [sigsFor(1, txns)],
    };

    const [blob] = await Msig.buildGroup(app([grp]), 1n);

    expect(subsigs(blob!).filter(Boolean)).toHaveLength(1);
  });

  it("picks the group by nonce", async () => {
    const first = [payment(1)];
    const second = [payment(2)];
    const groups: MsigGroup[] = [
      { nonce: 1n, txns: first, stxns: [null], sigs: [sigsFor(0, first)] },
      { nonce: 2n, txns: second, stxns: [null], sigs: [sigsFor(0, second)] },
    ];

    const [blob] = await Msig.buildGroup(app(groups), 2n);

    expect(algosdk.decodeSignedTransaction(blob!).txn.txID()).toBe(
      second[0]!.txID()
    );
  });

  describe("reports and returns nothing", () => {
    async function failure(a: Arc55App | undefined, nonce: bigint) {
      const snack = vi.spyOn(testStore, "setSnackbar");
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(await Msig.buildGroup(a, nonce)).toEqual([]);
        return (snack.mock.calls[0] as unknown[] | undefined)?.[0];
      } finally {
        snack.mockRestore();
        err.mockRestore();
      }
    }

    it("for a missing app", async () => {
      expect(await failure(undefined, 1n)).toBe("Invalid App");
    });

    it("for a nonce with no group", async () => {
      expect(await failure(app([]), 1n)).toBe("Invalid Group");
    });

    it("for a signature from an address outside the multisig", async () => {
      const txns = [payment(1)];
      const outsider = algosdk.generateAccount();
      const grp: MsigGroup = {
        nonce: 1n,
        txns,
        stxns: [null],
        sigs: [
          {
            addr: outsider.addr.toString(),
            sigs: [txns[0]!.rawSignTxn(outsider.sk).toBase64()],
          },
        ],
      };
      expect(await failure(app([grp]), 1n)).toBeTruthy();
    });
  });
});
