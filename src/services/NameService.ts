import type { NsLookup, NsObject } from "@/types";
import { fetchAsync } from "@/utils";
import algosdk from "algosdk";

interface SendFromVaultRequest {
  amount: number;
  /* Algorand ASA IDs to transfer FROM vault - use asset 0 to send ALGO. Specifying multiple assets
  means ALL of each are sent and amount is ignored. If receiver is a vault and needs to opt-in,
  then need MBR/opt-in pairs (5 pairs - 8 opt-ins each - 40 assets), then 6 send calls of 7 assets
  w/ 5 at end for total of 40. If receiver is already opted-in, then 112 (7 per txn, 16 tnxs) is
  max. */
  assets: number[];
  /* Optional note to include in asset send transaction */
  note?: string;
  /* Algorand account or NFD Name (if vault receiver) the asset(s) should be sent to */
  receiver: string;
  /* Specifies that the receiver account is something the caller can sign for. If specified, then
  opt-in transactions it signs may be included */
  receiverCanSign?: boolean;
  /* Account or NFD Vault the asset should be sent to (if allowed) */
  receiverType?: "account" | "nfdVault";
  /* Sender of transaction, must be NFD owner */
  sender: string;
}

export async function nfdsByAddress(addr: string) {
  const store = useAppStore();
  const resp = await fetchAsync(
    `${store.network.nfdUrl}/nfd/v2/address?address=${addr}&allowUnverified=false`
  );
  return resp[addr];
}

export async function sendFromVault(name: string, data: SendFromVaultRequest) {
  const store = useAppStore();
  const resp = await fetch(
    `${store.network.nfdUrl}/nfd/vault/sendFrom/${name}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  const json = JSON.parse(await resp.json()) as [string, string][];
  const txns = json.map((x) =>
    x[0] === "u"
      ? algosdk.decodeUnsignedTransaction(Buffer.from(x[1], "base64"))
      : algosdk.decodeSignedTransaction(Buffer.from(x[1], "base64")).txn
  );
  const indexesToSign = json.some((x) => x[0] == "s")
    ? json.flatMap((x, idx) => (x[0] === "u" ? idx : []))
    : undefined;
  return { txns, indexesToSign };
}

const NameService = {
  async search(q: string) {
    const store = useAppStore();
    if (store.isVoi) {
      if (!store.network.envoiUrl) return [];
      const data = await fetchAsync(
        `${store.network.envoiUrl}/search?type=starts&pattern=${q}`
      );
      return data.results.map((envoi: any) => ({
        title: envoi.name,
        value: envoi.address,
      })) as NsLookup[];
    } else {
      if (!store.network.nfdUrl) return [];
      const data = await fetchAsync(
        `${store.network.nfdUrl}/nfd/v2/search?name=${q}`
      );
      return data.nfds
        .filter((nfd: any) => nfd.depositAccount)
        .map((nfd: any) => ({
          title: nfd.name,
          value: nfd.depositAccount,
        })) as NsLookup[];
    }
  },
  async reverseLookup(addrs: string[]) {
    const store = useAppStore();
    // break lookup into groups of 20
    const groups = addrs.reduce((all: any, one: any, i: number) => {
      const ch = Math.floor(i / 20);
      all[ch] = [].concat(all[ch] || [], one);
      return all;
    }, []);
    let lookups: NsObject = {};
    await Promise.all(
      groups.map(async (g: string[]) => {
        if (store.isVoi) {
          if (!store.network.envoiUrl) return lookups;
          const url = `${store.network.envoiUrl}/name/` + g.join(",");
          const resp = await fetchAsync(url);
          const nsObject: NsObject = {};
          resp.results.forEach((x: any) => {
            if (x.type === "addr") nsObject[x.address] = { name: x.name };
          });
          lookups = { ...lookups, ...nsObject };
        } else {
          if (!store.network.nfdUrl) return lookups;
          const addrs = g.map((addr) => ["address", addr]);
          const url =
            `${store.network.nfdUrl}/nfd/lookup?` +
            new URLSearchParams([...addrs, ["view", "brief"]]).toString();
          const resp = await fetchAsync(url);
          lookups = { ...lookups, ...resp };
        }
      })
    );
    return lookups || {};
  },
};

export default NameService;
