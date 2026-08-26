import { Algodv2, Indexer, Kmd } from "algosdk";

let algodCache: { key: string; client: Algodv2 } | undefined;
let indexerCache: { key: string; client: Indexer } | undefined;
let kmdCache: { key: string; client: Kmd } | undefined;

const Algo = {
  get algod() {
    const store = useAppStore();
    const cfg =
      store.fallback && store.network.fallback
        ? store.network.fallback.algod
        : store.network.algod;
    const key = `${cfg.token}|${cfg.url}|${cfg.port}`;
    if (algodCache?.key !== key)
      algodCache = { key, client: new Algodv2(cfg.token, cfg.url, cfg.port) };
    return algodCache.client;
  },
  get indexer() {
    const store = useAppStore();
    if (!store.network.indexer) return;
    const cfg =
      store.fallback && store.network.fallback
        ? store.network.fallback.indexer
        : store.network.indexer;
    const key = `${cfg.token}|${cfg.url}|${cfg.port}`;
    if (indexerCache?.key !== key)
      indexerCache = { key, client: new Indexer(cfg.token, cfg.url, cfg.port) };
    return indexerCache.client;
  },
  get kmd() {
    const store = useAppStore();
    const cfg = store.network.kmd;
    if (!cfg) throw Error("Invalid Network");
    const key = `${cfg.token}|${cfg.url}|${cfg.port}`;
    if (kmdCache?.key !== key)
      kmdCache = { key, client: new Kmd(cfg.token, cfg.url, cfg.port) };
    return kmdCache.client;
  },
};

export async function getAuthAccts(addr: string): Promise<string[]> {
  if (!Algo.indexer) return [];
  const store = useAppStore();
  try {
    const { accounts } = await Algo.indexer
      .searchAccounts()
      .authAddr(addr)
      .do();
    return accounts.map((a: any) => a.address);
  } catch (err: any) {
    store.setSnackbar("Indexer Error", "error");
    console.error(err);
    return [];
  }
}

export async function getSuggestedParams(isFalcon1024: boolean) {
  const sp = await Algo.algod.getTransactionParams().do();
  if (isFalcon1024) sp.minFee = 3000n;
  return sp;
}

export default Algo;
