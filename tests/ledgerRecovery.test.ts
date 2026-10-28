import LedgerRecovery from "@/services/LedgerRecovery";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";

// APP_SEED and expected key from Zondax/ledger-algorand tests_zemu, which run
// the Algorand app on speculos.
const APP_SEED =
  "glory promote mansion idle axis finger extra february uncover one trip resource lawn turtle enact monster seven myth punch hobby comfort wild raise skin";

async function addr(account: number, passphrase?: string) {
  const root = LedgerRecovery.root(APP_SEED, passphrase);
  const mn = await LedgerRecovery.mnemonic(root, account);
  return algosdk.mnemonicToSecretKey(mn);
}

describe("LedgerRecovery", () => {
  it("matches the Ledger Algorand app's test vector", async () => {
    const acct = await addr(123);
    expect(Buffer.from(acct.addr.publicKey).toString("hex")).toBe(
      "0dfdbcdb8eebed628cfb4ef70207b86fd0deddca78e90e8c59d6f441e383b377"
    );
    expect(acct.addr.toString()).toBe(
      "BX63ZW4O5PWWFDH3J33QEB5YN7IN5XOKPDUQ5DCZ232EDY4DWN3XKUQRCA"
    );
  });

  it("derives account 0 and signs with it", async () => {
    const acct = await addr(0);
    expect(acct.addr.toString()).toBe(
      "D3GP2HWALZASL6XGSDHMFJ3YHGU2GYRV3VXC5L52PHFCLQG2MD4KIPKKAA"
    );
    const msg = new Uint8Array([1, 2, 3]);
    const sig = algosdk.signBytes(msg, acct.sk);
    expect(algosdk.verifyBytes(msg, sig, acct.addr.toString())).toBe(true);
  });

  it("derives different accounts with a passphrase", async () => {
    const acct = await addr(0, "hunter2");
    expect(acct.addr.toString()).not.toBe(
      "D3GP2HWALZASL6XGSDHMFJ3YHGU2GYRV3VXC5L52PHFCLQG2MD4KIPKKAA"
    );
  });
});
