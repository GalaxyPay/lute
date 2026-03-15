import { Algodv2, Indexer, Kmd } from "algosdk";

const Algo = {
  get algod() {
    const store = useAppStore();
    if (store.fallback && store.network.fallback)
      return new Algodv2(
        store.network.fallback.algod.token,
        store.network.fallback.algod.url,
        store.network.fallback.algod.port
      );
    else
      return new Algodv2(
        store.network.algod.token,
        store.network.algod.url,
        store.network.algod.port
      );
  },
  get indexer() {
    const store = useAppStore();
    if (!store.network.indexer) return;
    if (store.fallback && store.network.fallback)
      return new Indexer(
        store.network.fallback.indexer.token,
        store.network.fallback.indexer.url,
        store.network.fallback.indexer.port
      );
    else
      return new Indexer(
        store.network.indexer.token,
        store.network.indexer.url,
        store.network.indexer.port
      );
  },
  get kmd() {
    const store = useAppStore();
    if (!store.network.kmd) throw Error("Invalid Network");
    return new Kmd(
      store.network.kmd.token,
      store.network.kmd.url,
      store.network.kmd.port
    );
  },
};

export async function getAuthAccts(
  addr: string,
  indexer: Indexer | undefined
): Promise<string[]> {
  if (!indexer) return [];
  const store = useAppStore();
  try {
    const { accounts } = await indexer.searchAccounts().authAddr(addr).do();
    return accounts.map((a: any) => a.address);
  } catch (err: any) {
    store.setSnackbar("Indexer Error", "error");
    console.error(err);
    return [];
  }
}

export default Algo;
