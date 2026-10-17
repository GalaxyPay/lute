// ARC-59 inbox on localnet, through the same Inbox service Xfer.vue and
// InboxAsset.vue use, priced as the wallet prices them. Each run deploys its
// own router, as Settings > Create Router does.
import { algo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Arc59Factory } from "@/clients/Arc59Client";
import Inbox from "@/services/Inbox";
import { priceTxns } from "@/utils/simulateFees";
import { algorand, funded, LOCALNET, submit, useLocalNet } from "./helpers";

type Acct = ReturnType<typeof algorand.account.random>;

let routerId: bigint;

beforeAll(async () => {
  const deployer = await funded();
  const factory = new Arc59Factory({ defaultSender: deployer, algorand });
  const { result, appClient } = await factory.send.create.createApplication();
  routerId = result.appId;
  // The router's own minimum balance, before any inbox exists.
  await algorand.send.payment({
    sender: deployer,
    receiver: appClient.appAddress,
    amount: algo(0.1),
  });
});

beforeEach(() => {
  useLocalNet({ network: { ...LOCALNET, inboxRouter: Number(routerId) } });
});

/** An asset with its whole supply held by a new funded creator. */
async function newAsset() {
  const creator = await funded();
  const { assetId } = await algorand.send.assetCreate({
    sender: creator,
    total: 1000n,
    decimals: 0,
  });
  return { creator, assetId };
}

/** Price as the wallet does for `by`, sign with its key, and submit. */
async function run(
  built:
    | algosdk.Transaction[]
    | { txns: algosdk.Transaction[]; feeIndexes: number[] },
  by: Acct
) {
  const { txns, feeIndexes } = Array.isArray(built)
    ? { txns: built, feeIndexes: undefined }
    : built;
  await priceTxns(txns, {}, feeIndexes);
  for (const t of txns) expect(t.sender.toString()).toBe(by.toString());
  return await submit(txns.map((t) => t.signTxn(by.account.sk)));
}

async function holding(addr: string, assetId: bigint) {
  const info = await algorand.client.algod.accountInformation(addr).do();
  return info.assets?.find((a) => a.assetId === assetId)?.amount;
}

let asker: Acct;

/** The receiver's inbox account, which the router derives. */
async function inboxOf(receiver: string) {
  // Any funded account can ask; the receiver may hold nothing yet.
  asker ??= await funded(1);
  const factory = new Arc59Factory({ defaultSender: asker, algorand });
  const client = factory.getAppClientById({ appId: routerId });
  const inbox = (
    await client
      .newGroup()
      .arc59GetInbox({
        args: { receiver },
        signer: algosdk.makeEmptyTransactionSigner(),
      })
      .simulate({ allowEmptySignatures: true, allowUnnamedResources: true })
  ).returns[0]!;
  const info = await algorand.client.algod.accountInformation(inbox).do();
  return { address: inbox, info };
}

describe("sending to an account that has not opted in", () => {
  it("is needed only without an opt-in and with a router", async () => {
    const { assetId } = await newAsset();
    const receiver = await funded(1);
    expect(await Inbox.needed(receiver.toString(), assetId)).toBe(true);

    await algorand.send.assetOptIn({ sender: receiver, assetId });
    expect(await Inbox.needed(receiver.toString(), assetId)).toBe(false);

    useLocalNet({ network: LOCALNET });
    const other = await funded(1);
    expect(await Inbox.needed(other.toString(), assetId)).toBe(false);
  });

  it("delivers to the inbox, and a brand-new account can claim it", async () => {
    const { creator, assetId } = await newAsset();
    // Never funded: the send must carry what the claim costs.
    const receiver = algorand.account.random();

    await run(
      await Inbox.sendTxns({
        sender: creator.toString(),
        receiver: receiver.toString(),
        assetId,
        amount: 7n,
      }),
      creator
    );

    const inbox = await inboxOf(receiver.toString());
    expect(inbox.info.assets?.find((a) => a.assetId === assetId)?.amount).toBe(
      7n
    );
    expect(await holding(creator.toString(), assetId)).toBe(993n);

    await run(
      await Inbox.claimTxns(receiver.toString(), assetId, false, inbox.info),
      receiver
    );

    expect(await holding(receiver.toString(), assetId)).toBe(7n);
    const after = await inboxOf(receiver.toString());
    expect(
      after.info.assets?.find((a) => a.assetId === assetId)?.amount ?? 0n
    ).toBe(0n);
  });

  it("adds a second send to the same inbox", async () => {
    const { creator, assetId } = await newAsset();
    const receiver = await funded(1);
    const send = async (amount: bigint) =>
      run(
        await Inbox.sendTxns({
          sender: creator.toString(),
          receiver: receiver.toString(),
          assetId,
          amount,
        }),
        creator
      );

    await send(3n);
    await send(4n);

    const inbox = await inboxOf(receiver.toString());
    expect(inbox.info.assets?.find((a) => a.assetId === assetId)?.amount).toBe(
      7n
    );
    await run(
      await Inbox.claimTxns(receiver.toString(), assetId, false, inbox.info),
      receiver
    );
    expect(await holding(receiver.toString(), assetId)).toBe(7n);
  });

  it("lets the receiver send it back to the creator instead", async () => {
    const { creator, assetId } = await newAsset();
    const receiver = await funded(1);
    await run(
      await Inbox.sendTxns({
        sender: creator.toString(),
        receiver: receiver.toString(),
        assetId,
        amount: 5n,
      }),
      creator
    );
    expect(await holding(creator.toString(), assetId)).toBe(995n);

    await run(await Inbox.rejectTxns(receiver.toString(), assetId), receiver);

    expect(await holding(creator.toString(), assetId)).toBe(1000n);
    expect(await holding(receiver.toString(), assetId)).toBeUndefined();
  });

  it("claims for a receiver that opted in meanwhile", async () => {
    const { creator, assetId } = await newAsset();
    const receiver = await funded(1);
    await run(
      await Inbox.sendTxns({
        sender: creator.toString(),
        receiver: receiver.toString(),
        assetId,
        amount: 2n,
      }),
      creator
    );
    await algorand.send.assetOptIn({ sender: receiver, assetId });
    const inbox = await inboxOf(receiver.toString());

    await run(
      await Inbox.claimTxns(receiver.toString(), assetId, true, inbox.info),
      receiver
    );

    expect(await holding(receiver.toString(), assetId)).toBe(2n);
  });

  it("refuses without a router", async () => {
    const { creator, assetId } = await newAsset();
    useLocalNet({ network: LOCALNET });
    await expect(
      Inbox.sendTxns({
        sender: creator.toString(),
        receiver: creator.toString(),
        assetId,
        amount: 1n,
      })
    ).rejects.toThrow("Invalid Router");
  });
});
