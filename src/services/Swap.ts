// In-wallet swaps through Hay's router (Haystack Router, TxnLab), MainNet only.
import { networks } from "@/data";
import { send } from "@/utils/send";
import { luteSigner } from "@/utils/signers";
import { priceTxns } from "@/utils/simulateFees";
import { userIndexes, validateSwapGroup } from "@/utils/swap";
import { RouterClient, type SwapQuote } from "@txnlab/haystack-router";
import type { TransactionSigner } from "algosdk";

const ROUTER_KEY = "f537ea2c-3be6-46bd-879a-32ffd5a4b9c3";
/** Receives 25% of the router fee. */
const REFERRER = "LUTEAFDWOSZMPJNCG3RRLVSULS2T33KFMKFVEUVFNQYA5TY3ZE2E3BZKAY";
/** Router fee charged to the user: 0.15%. */
export const FEE_BPS = 15;

export type { SwapQuote };

export function swapSupported() {
  return useAppStore().networkName === "MainNet";
}

/**
 * The node the SDK reads from: the one the app is using, fallback included
 * (the 4160 nodely tier only answers lute.app). Its settings go to the router
 * API with every quote, so a node with a token is swapped for Lute's public
 * MainNet fallback.
 */
function routerAlgod() {
  const store = useAppStore();
  const cfg =
    store.fallback && store.network.fallback
      ? store.network.fallback.algod
      : store.network.algod;
  if (!cfg.token) return cfg;
  const mainnet = networks.find((n) => n.name === "MainNet")!;
  return mainnet.fallback?.algod ?? mainnet.algod;
}

let router: { key: string; client: RouterClient } | undefined;
function client() {
  const { url, port } = routerAlgod();
  const key = `${url}|${port}`;
  if (router?.key !== key)
    router = {
      key,
      client: new RouterClient({
        apiKey: ROUTER_KEY,
        algodUri: url,
        algodToken: "",
        algodPort: port || 443,
        referrerAddress: REFERRER,
        feeBps: FEE_BPS,
      }),
    };
  return router.client;
}

export function getQuote(p: {
  from: bigint;
  to: bigint;
  amount: bigint;
  address: string;
  /** Whether the account must opt in to `to`; the caller knows its holdings. */
  optIn: boolean;
  maxGroupSize?: number;
}) {
  return client().newQuote({
    fromASAID: p.from,
    toASAID: p.to,
    amount: p.amount,
    address: p.address,
    optIn: p.optIn,
    maxGroupSize: p.maxGroupSize,
  });
}

/**
 * Build the swap from `quote`, price it for this signer, review and sign it
 * in the sign dialog (which shows `summary`) and send it.
 */
export async function executeSwap(p: {
  quote: SwapQuote;
  acct: { addr: string; isFalcon25?: boolean };
  slippage: number;
  summary: string;
}) {
  const store = useAppStore();
  const { genesisHash } = store.network;
  if (!genesisHash) throw Error("Unknown Network");
  const expect = {
    address: p.acct.addr,
    fromASAID: BigInt(p.quote.fromASAID),
    amount: p.quote.amount,
    feeBps: FEE_BPS,
    genesisHash: Uint8Array.fromBase64(genesisHash),
  };
  const signer: TransactionSigner = async (group, idxs) => {
    if (store.debug)
      console.log(
        "[Lute Debug] swap group",
        group.map((t, idx) => ({
          idx,
          sign: idxs.includes(idx),
          type: t.type,
          sender: t.sender.toString(),
          amount: t.payment?.amount ?? t.assetTransfer?.amount,
          asset: t.assetTransfer?.assetIndex,
          receiver: (t.payment?.receiver ?? t.assetTransfer?.receiver)?.toString(),
          app: t.applicationCall?.appIndex,
          fee: t.fee,
        }))
      );
    validateSwapGroup(group, idxs, expect);
    return luteSigner(group, idxs, { summary: p.summary });
  };
  const composer = await client().newSwap({
    quote: p.quote,
    address: p.acct.addr,
    slippage: p.slippage,
    signer,
  });
  await composer.addSwapTransactions();
  // The router prices for an ed25519 signer. The composer signs these same
  // txn objects, so raising their fees here is what gets signed.
  const group = composer.buildGroup().map((t) => t.txn);
  await priceTxns(group, p.acct, userIndexes(group, p.acct.addr));
  const signed = await composer.sign();
  return send(signed, "Swap completed");
}
