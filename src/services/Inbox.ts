/**
 * ARC-59 asset inbox. Builds unsigned, unpriced txns only; callers price them
 * for the signing account (priceTxns), sign and send as for any other group.
 */
import { Arc59Factory } from "@/clients/Arc59Client";
import Algo from "@/services/Algo";
import { composerTxns } from "@/utils/simulateFees";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";

// Building a group only simulates it; nothing here is ever signed.
const unsigned = algosdk.makeEmptyTransactionSigner();
const SIMULATE = {
  allowEmptySignatures: true,
  allowUnnamedResources: true,
  fixSigners: true,
};

function router(sender: string) {
  const store = useAppStore();
  if (!store.network.inboxRouter) throw Error("Invalid Router");
  const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
  algorand.setDefaultSigner(unsigned);
  algorand.setDefaultValidityWindow(1000);
  const factory = new Arc59Factory({ defaultSender: sender, algorand });
  return factory.getAppClientById({
    appId: BigInt(store.network.inboxRouter),
  });
}

export interface InboxSend {
  sender: string;
  receiver: string;
  assetId: bigint;
  amount: bigint;
  note?: Uint8Array;
  closeRemainderTo?: string;
  assetSender?: string;
}

export interface InboxBalance {
  amount: bigint;
  minBalance: bigint;
}

const Inbox = {
  /** Whether a send to `receiver` must go through the inbox. */
  async needed(receiver: string, assetId: bigint) {
    const store = useAppStore();
    if (!store.network.inboxRouter) return false;
    const info = await Algo.algod.accountInformation(receiver).do();
    return !info.assets?.some((a) => a.assetId === assetId);
  },

  async sendTxns(s: InboxSend) {
    const appClient = router(s.sender);
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const info = (
      await appClient
        .newGroup()
        .arc59GetSendAssetInfo({
          args: { asset: s.assetId, receiver: s.receiver },
        })
        .simulate(SIMULATE)
    ).returns[0];
    if (!info) throw Error("Simulate Failed");
    const [itxns, mbr, routerOptedIn, , receiverAlgoNeededForClaim] = info;
    // Plus the fee of the claim itself.
    const receiverAlgo = receiverAlgoNeededForClaim
      ? receiverAlgoNeededForClaim + 2000n
      : 0n;
    const composer = appClient.newGroup();
    const appAddr = appClient.appClient.appAddress;
    const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      assetIndex: s.assetId,
      receiver: appAddr,
      sender: s.sender,
      note: s.note,
      suggestedParams,
      amount: s.amount,
      closeRemainderTo: s.closeRemainderTo,
      assetSender: s.assetSender,
    });
    if (mbr || receiverAlgo)
      composer.addTransaction(
        algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          receiver: appAddr,
          sender: s.sender,
          suggestedParams,
          amount: mbr + receiverAlgo,
        }),
        unsigned
      );
    if (!routerOptedIn) composer.arc59OptRouterIn({ args: { asa: s.assetId } });
    // Sending claim funds is one more inner txn.
    const totalItxns = itxns + (receiverAlgo === 0n ? 0n : 1n);
    // Only a starting point for the resource simulate; priceTxns sets the real fee.
    const fee = Number(
      suggestedParams.minFee + totalItxns * 1000n
    ).microAlgos();
    const inbox = (
      await appClient
        .newGroup()
        .arc59GetInbox({ args: { receiver: s.receiver } })
        .simulate(SIMULATE)
    ).returns[0];
    composer.arc59SendAsset({
      args: {
        axfer,
        receiver: s.receiver,
        additionalReceiverFunds: receiverAlgo,
      },
      staticFee: fee,
      boxReferences: [algosdk.Address.fromString(s.receiver).publicKey],
      accountReferences: [s.receiver, inbox!],
      assetReferences: [s.assetId],
    });
    return await composerTxns(await composer.composer());
  },

  /**
   * Price with `feeIndexes`: a new account holds no Algo until the claim pays
   * out its inbox's Algo, so only the final claim txn may carry added fees.
   */
  async claimTxns(
    claimer: string,
    assetId: bigint,
    claimerOptedIn: boolean,
    inbox: InboxBalance
  ) {
    const composer = router(claimer).newGroup();
    let outerTxnCount = 1;
    let innerTxnCount = 2;
    // Algo above the inbox's minimum balance comes out too.
    if (inbox.minBalance < inbox.amount) {
      outerTxnCount++;
      innerTxnCount++;
      composer.arc59ClaimAlgo({ args: {}, staticFee: (0).algo() });
    }
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    if (!claimerOptedIn)
      composer.addTransaction(
        algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: claimer,
          receiver: claimer,
          amount: 0,
          assetIndex: assetId,
          suggestedParams,
        }),
        unsigned
      );
    // A starting point; priceTxns sets the exact fee.
    const fee = (
      Number(suggestedParams.minFee) * outerTxnCount +
      innerTxnCount * 1000
    ).microAlgos();
    composer.arc59Claim({ args: { asa: assetId }, staticFee: fee });
    const txns = await composerTxns(await composer.composer());
    return { txns, feeIndexes: [txns.length - 1] };
  },

  /** ARC-59 reject returns the asset to its creator. */
  async rejectTxns(claimer: string, assetId: bigint) {
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const fee = (Number(suggestedParams.minFee) + 2000).microAlgos();
    const composer = router(claimer)
      .newGroup()
      .arc59Reject({ args: { asa: assetId }, staticFee: fee });
    return await composerTxns(await composer.composer());
  },
};

export default Inbox;
