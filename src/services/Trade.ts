// In-wallet trades through Hay's router (Haystack Router, TxnLab), MainNet only.
import { networks } from "@/data";
import Algo from "@/services/Algo";
import { send } from "@/utils/send";
import { luteSigner } from "@/utils/signers";
import { falconPlaceholderSigner, simulateFees } from "@/utils/simulateFees";
import { userIndexes, validateTradeGroup } from "@/utils/trade";
import { RouterClient, type SwapQuote } from "@txnlab/haystack-router";
import type { Transaction, TransactionSigner } from "algosdk";

const ROUTER_KEY = "f537ea2c-3be6-46bd-879a-32ffd5a4b9c3";
/** Receives 25% of the router fee. */
const REFERRER = "LUTEAFDWOSZMPJNCG3RRLVSULS2T33KFMKFVEUVFNQYA5TY3ZE2E3BZKAY";
/** Router fee charged to the user: 0.15%. */
export const FEE_BPS = 15;
/** Extra min fees a user txn may be raised by, e.g. for a Falcon signature. */
const PRICE_HEADROOM = 10n;

export type { SwapQuote };

export function tradeSupported() {
  return !!ROUTER_KEY && useAppStore().networkName === "MainNet";
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
 * Raise the fees of the user's txns to what algod requires once they are
 * signed by `acct` (the router prices for an ed25519 signer). The composer
 * holds these same txn objects and signs them later, router lsigs included,
 * so the regrouped txns are what gets signed.
 */
async function priceTradeGroup(
  group: Transaction[],
  acct: { addr: string; isFalcon25?: boolean }
) {
  const sp = await Algo.algod.getTransactionParams().do();
  const headroom = BigInt(sp.minFee) * PRICE_HEADROOM;
  const simSigner = acct.isFalcon25 ? falconPlaceholderSigner : undefined;
  const mine = userIndexes(group, acct.addr);
  await simulateFees(
    group.map((txn, idx) =>
      mine.includes(idx)
        ? { txn, maxFee: txn.fee + headroom, simSigner }
        : { txn }
    ),
    { suggestedParams: sp }
  );
}

/**
 * Build the trade from `quote`, price it for this signer, review and sign it
 * in the sign dialog (which shows `summary`) and send it.
 */
export async function executeTrade(p: {
  quote: SwapQuote;
  acct: { addr: string; isFalcon25?: boolean };
  slippage: number;
  summary: string;
}) {
  const { genesisHash } = useAppStore().network;
  if (!genesisHash) throw Error("Unknown Network");
  const expect = {
    address: p.acct.addr,
    fromASAID: BigInt(p.quote.fromASAID),
    amount: p.quote.amount,
    genesisHash: Uint8Array.fromBase64(genesisHash),
  };
  const signer: TransactionSigner = async (group, idxs) => {
    validateTradeGroup(group, idxs, expect);
    return luteSigner(group, idxs, { summary: p.summary });
  };
  const composer = await client().newSwap({
    quote: p.quote,
    address: p.acct.addr,
    slippage: p.slippage,
    signer,
  });
  await composer.addSwapTransactions();
  await priceTradeGroup(
    composer.buildGroup().map((t) => t.txn),
    p.acct
  );
  const signed = await composer.sign();
  return send(signed, "Trade completed");
}
