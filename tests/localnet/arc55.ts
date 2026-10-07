// ARC-55 multisig apps on localnet, set up the way members' wallets would:
// deployed as CreateMsig.vue does, groups and signatures added through the
// app's own methods.
import { microAlgo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { MsigAppFactory, type MsigAppClient } from "@/clients/MsigApp.client";
import { algorand, funded } from "./helpers";

export type Acct = Awaited<ReturnType<typeof funded>>;

export interface Deployed {
  appId: bigint;
  admin: Acct;
  client: MsigAppClient;
  members: Acct[];
  msigAddr: string;
  mparams: algosdk.MultisigMetadata;
}

/** A 2-of-3 ARC-55 app, as CreateMsig.vue deploys it. */
export async function deploy(): Promise<Deployed> {
  const admin = await funded();
  const members = [await funded(), await funded(), await funded()];
  const addrs = members.map((m) => m.toString());
  const factory = new MsigAppFactory({ defaultSender: admin, algorand });
  const { appClient, result } = await factory.send.create.deploy({
    args: { admin: admin.toString(), threshold: 2, addresses: addrs },
  });
  const mparams = { version: 1, threshold: 2, addrs };
  return {
    appId: result.appId,
    admin,
    client: appClient,
    members,
    msigAddr: algosdk.multisigAddress(mparams).toString(),
    mparams,
  };
}

/** Store txns as a new group, the way any member's wallet would. */
export async function propose(
  d: Deployed,
  by: Acct,
  txns: algosdk.Transaction[]
) {
  const client = d.client.clone({ defaultSender: by });
  await algorand.send.payment({
    sender: by,
    receiver: client.appAddress,
    amount: microAlgo(100_000),
  });
  const nonce = (await client.send.arc55NewTransactionGroup({ args: {} }))
    .return!;
  for (const [index, txn] of txns.entries()) {
    const bytes = txn.toByte();
    const costs = await algorand.createTransaction.payment({
      sender: by,
      receiver: client.appAddress,
      amount: microAlgo(2500 + 400 * (9 + bytes.length)),
    });
    await client.send.arc55AddTransaction({
      args: { costs, transactionGroup: nonce, index, transaction: bytes },
      populateAppCallResources: true,
    });
  }
  return nonce;
}

/** One member's signatures on every txn of a group, as Msig.vue sends them. */
export async function sign(
  d: Deployed,
  member: Acct,
  nonce: bigint,
  txns: algosdk.Transaction[]
) {
  const client = d.client.clone({ defaultSender: member });
  const costs = await algorand.createTransaction.payment({
    sender: member,
    receiver: client.appAddress,
    amount: microAlgo(2500 + 400 * (42 + 64 * txns.length)),
  });
  await client.send.arc55SetSignatures({
    args: {
      costs,
      transactionGroup: nonce,
      signatures: txns.map((t) => t.rawSignTxn(member.account.sk)),
    },
    populateAppCallResources: true,
  });
}

export async function payFrom(
  sender: string,
  receiver: string,
  amount: number
) {
  return await algorand.createTransaction.payment({
    sender,
    receiver,
    amount: microAlgo(amount),
    validityWindow: 1000,
  });
}

export const balance = async (addr: string) =>
  (await algorand.client.algod.accountInformation(addr).do()).amount;
