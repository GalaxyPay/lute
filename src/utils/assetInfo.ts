import { get, set } from "@/dbLute";
import Algo from "@/services/Algo";
import { modelsv2 } from "algosdk";

export async function getAssetInfo(id: bigint, noImage: boolean = false) {
  try {
    const numId = Number(id);
    let assetInfo: modelsv2.Asset | undefined;
    const appStore = useAppStore();
    const storeName = ("assets-" + appStore.networkName.toLowerCase()) as
      | "assets-betanet"
      | "assets-mainnet"
      | "assets-testnet"
      | "assets-voi mainnet"
      | "assets-voi testnet";
    if (!["LocalNet", "FNet"].includes(appStore.networkName)) {
      assetInfo = await get(storeName, numId);
      if (assetInfo) assetInfo.index = BigInt(assetInfo.index);
    }
    if (
      !assetInfo ||
      (assetInfo.params.url?.startsWith("template-ipfs") && !noImage)
    ) {
      assetInfo = await Algo.algod.getAssetByID(numId).do();
      if (!["LocalNet", "FNet"].includes(appStore.networkName))
        await set(storeName, undefined, {
          ...assetInfo,
          index: numId,
        });
    }
    if (appStore.networkName === "MainNet") {
      const tinyPng = appStore.tinyman?.[numId]?.logo.png;
      if (tinyPng) assetInfo.params.url = tinyPng;
    }
    return assetInfo;
  } catch (err: any) {
    console.error(err);
  }
}
