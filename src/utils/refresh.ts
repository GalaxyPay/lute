import Algo, { getAuthAccts } from "@/services/Algo";
import HdWallet from "@/services/HdWallet";
import NameService from "@/services/NameService";
import type { AccountHD } from "@/types";

interface Sibling {
  addrIdx: number;
  addr: string;
}

export async function refresh() {
  const store = useAppStore();
  store.loading++;
  if (!store.fallback && store.network.fallback)
    try {
      await Algo.algod.status().do();
    } catch {
      console.log("Using fallback networks");
      store.fallback = true;
    }
  const info: AccountHD[] = [];
  try {
    const algodClient = Algo.algod;
    const indexer = Algo.indexer;
    await Promise.all(
      store.accounts
        .filter((a) => !a.network || a.network === store.networkName)
        .map(async (a) => {
          const ai = await algodClient.accountInformation(a.addr).do();
          const aa = await getAuthAccts(a.addr, indexer);
          info.push(ai);
          // rekeyed accounts (sub-accounts)
          await Promise.all(
            aa
              .filter((sa) => !store.accounts.some((i) => i.addr === sa))
              .map(async (sa) => {
                const sai = await algodClient.accountInformation(sa).do();
                info.push(sai);
              })
          );
          // hd siblings
          if (a.idxs && a.xpub) {
            const hd: Sibling[] = [];
            await Promise.all(
              a.idxs.map(async (addrIdx) => {
                hd.push({
                  addrIdx,
                  addr: await HdWallet.deriveAddr(a.xpub!, addrIdx),
                });
              })
            );
            await Promise.all(
              hd.map(async (hda) => {
                const hdai = (await algodClient
                  .accountInformation(hda.addr)
                  .do()) as AccountHD;
                hdai.addrIdx = hda.addrIdx;
                hdai.sibling = a.addr;
                info.push(hdai);
              })
            );
          }
        })
    );
  } catch (err: any) {
    console.error(err);
  }
  store.info = info;
  try {
    store.nsObj = await NameService.reverseLookup(info.map((a) => a.address));
  } catch (err: any) {
    console.error(err);
  }
  store.loading--;
}
