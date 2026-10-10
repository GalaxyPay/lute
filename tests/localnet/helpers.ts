// Shared setup for tests against algokit localnet. Every test works with
// fresh random accounts, so state left on the chain by earlier runs does not
// matter.
import { AlgorandClient, algo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
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
  const { txid } = await algorand.client.algod
    .sendRawTransaction(signed)
    .do();
  return await algosdk.waitForConfirmation(algorand.client.algod, txid, 10);
}
