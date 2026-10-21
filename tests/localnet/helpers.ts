// Shared setup for tests against algokit localnet. Every test works with
// fresh random accounts, so state left on the chain by earlier runs does not
// matter.
import { AlgorandClient, algo } from "@algorandfoundation/algokit-utils";
import algosdk, { type Address } from "algosdk";
import { generateKey, signCompressed } from "falcon-1024";
import { networks } from "@/data";
import type { Network } from "@/types";
import { testStore } from "../stubs/store";

export const LOCALNET = networks.find((n) => n.name === "LocalNet") as Network;

/** Point Algo (and so every service) at localnet through the store stub. */
export function useLocalNet(extra: Record<string, unknown> = {}) {
  Object.assign(testStore, {
    network: LOCALNET,
    networkName: LOCALNET.name,
    allNetworks: networks,
    fallback: false,
    isWeb: true,
    debug: false,
    device: { transport: undefined },
    luteTxns: undefined,
    refresh: 0,
    accounts: [],
    ...extra,
  });
  return testStore as any;
}

const { algod, kmd } = LOCALNET;
export const algorand = AlgorandClient.fromConfig({
  algodConfig: { server: algod.url, port: algod.port, token: algod.token },
  kmdConfig: { server: kmd!.url, port: kmd!.port, token: kmd!.token },
});

/** A new account funded from the localnet dispenser, its signer registered. */
export async function funded(algos = 10) {
  const acct = algorand.account.random();
  const dispenser = await algorand.account.localNetDispenser();
  await algorand.send.payment({
    sender: dispenser,
    receiver: acct,
    amount: algo(algos),
  });
  return acct;
}

/** Submit signed txns and wait for them. */
export async function submit(signed: Uint8Array[]) {
  const { txid } = await algorand.client.algod.sendRawTransaction(signed).do();
  return await algosdk.waitForConfirmation(algorand.client.algod, txid, 10);
}

/** Who signs for a sender on chain, and how the wallet flags it. */
export interface Auth {
  addr: string;
  isFalcon25?: boolean;
  sign: (txn: algosdk.Transaction) => Promise<Uint8Array>;
}

export function ed25519(acct: {
  addr: Address;
  account: algosdk.Account;
}): Auth {
  return {
    addr: acct.addr.toString(),
    sign: async (txn) => txn.signTxn(acct.account.sk),
  };
}

/** A new Falcon-1024 account, signed for as Signer.falconSigner does. */
export function falcon(): Auth {
  const { publicKey, privateKey } = generateKey();
  const { address, txnSigner } =
    algosdk.addressWithSignersFromRawFalcon1024Signer({
      falcon1024PublicKey: publicKey,
      falcon1024Signer: async (bytes: Uint8Array) =>
        signCompressed(privateKey, bytes),
    });
  return {
    addr: address.toString(),
    isFalcon25: true,
    sign: async (txn) => (await txnSigner([txn], [0]))[0]!,
  };
}

/** A 2-of-3 native multisig over new ed25519 keys. */
export function multisig(): Auth {
  const keys = [0, 1, 2].map(() => algosdk.generateAccount());
  const mparams = {
    version: 1,
    threshold: 2,
    addrs: keys.map((k) => k.addr.toString()),
  };
  return {
    addr: algosdk.multisigAddress(mparams).toString(),
    sign: async (txn) => {
      const a = algosdk.signMultisigTransaction(txn, mparams, keys[0]!.sk);
      return algosdk.appendSignMultisigTransaction(a.blob, mparams, keys[1]!.sk)
        .blob;
    },
  };
}
