<template>
  <v-container class="pt-0">
    <v-card :loading="loading">
      <v-card-title>Atomic Swap</v-card-title>
      <v-card-subtitle>
        Swap assets directly with another party - no middle-man or smart
        contract
      </v-card-subtitle>
      <v-container v-if="reviewTxns">
        <v-container class="text-center">
          <div style="font-family: monospace">
            {{ reviewTxns[0]?.sender }}
          </div>
          is proposing a swap. They would like to send you
          <span class="text-warning"> {{ formatAsset(reviewTxns[0]!) }} </span>
          in exchange for
          <span class="text-warning"> {{ formatAsset(reviewTxns[1]!) }} </span>.
          <div class="pt-6 font-weight-bold">
            REVIEW BOTH TRANSACTIONS CARFULLY BEFORE SIGNING
          </div>
        </v-container>
        <v-container class="text-center">
          <v-btn text="Copy Link" @click="copyLink()" />
          <v-btn text="Review & Sign" @click="accept()" />
          <v-row v-if="extensionDetected">
            <v-col class="pb-0">
              <v-btn text="Open in Extension" @click="openExtension()" />
            </v-col>
          </v-row>
        </v-container>
      </v-container>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import router from "@/router";
import Algo from "@/services/Algo";
import { bigintToString, copyToClipboard, send } from "@/utils";
import { luteSigner } from "@/utils/signers";
import algosdk, { modelsv2 } from "algosdk";

const store = useAppStore();

const reviewTxns = ref<algosdk.Transaction[]>();
const assets = reactive<modelsv2.Asset[]>([]);
let tx1: string | null;
let tx2: string | null;
let stxn1: Uint8Array;

const loading = ref(false);
const extensionDetected = ref(false);

onMounted(async () => {
  try {
    const params = new URLSearchParams(location.search);
    tx1 = params.get("tx1");
    tx2 = params.get("tx2");
    if (!tx1 || !tx2) {
      router.replace("/");
      reviewTxns.value = undefined;
      await store.getCache();
      store.refresh++;
      return;
    }
    if (!store.isWeb) browser.runtime.connect({ name: "luteSidepanel" });
    loading.value = true;
    stxn1 = Buffer.from(tx1, "base64");
    const txn1 = algosdk.decodeSignedTransaction(stxn1).txn;
    const txn2 = algosdk.decodeUnsignedTransaction(Buffer.from(tx2, "base64"));
    // check group
    if (
      !txn1.group ||
      !txn2.group ||
      txn1.group.toString() !== txn2.group.toString()
    )
      throw Error("Invalid Group");
    // check swap addresses
    const receiver1 = txn1.payment?.receiver ?? txn1.assetTransfer?.receiver;
    const receiver2 = txn2.payment?.receiver ?? txn2.assetTransfer?.receiver;
    if (
      !receiver1 ||
      !receiver2 ||
      txn1.sender.toString() !== receiver2.toString() ||
      txn2.sender.toString() !== receiver1.toString()
    )
      throw Error("Invalid Swap");
    // check network and switch
    if (!txn1.genesisHash || !txn2.genesisHash)
      throw Error("Missing Genesis Hash");
    const genHash1 = Buffer.from(txn1.genesisHash).toString("base64");
    const genHash2 = Buffer.from(txn2.genesisHash).toString("base64");
    if (genHash1 !== genHash2) throw Error("Network Mismatch");
    const network = store.allNetworks.find(
      (n) =>
        n.genesisID ===
          (txn1.genesisID === "sandnet-v1" ? "dockernet-v1" : txn1.genesisID) &&
        (n.genesisHash === genHash1 || !n.genesisHash)
    )?.name;
    if (!network) throw Error("Unknown Network");
    store.networkName = network;
    store.refresh++;
    // check lastValid
    const status = await Algo.algod.status().do();
    if (status.lastRound > txn1.lastValid || status.lastRound > txn2.lastValid)
      throw Error("Swap Expired");
    // lookup assets
    await Promise.all(
      [txn1, txn2]
        .filter((t) => t.assetTransfer)
        .map(async (t) => {
          const asset = await Algo.algod
            .getAssetByID(t.assetTransfer!.assetIndex)
            .do();
          assets.push(asset);
        })
    );
    reviewTxns.value = [txn1, txn2];
    interface IWindow extends Window {
      lute?: boolean;
    }
    if (store.isWeb && (window as IWindow).lute) {
      extensionDetected.value = true;
    }
  } catch (err: any) {
    router.replace("/");
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  loading.value = false;
});

onBeforeRouteLeave(async () => {
  await store.getCache();
  store.refresh++;
});

async function accept() {
  try {
    if (!stxn1 || !reviewTxns.value) throw Error("Invalid Transactions");
    const resp = await luteSigner(reviewTxns.value, [1]);
    await send([stxn1, resp[1]!], "Swap Completed");
    router.replace("/");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

function formatAsset(txn: algosdk.Transaction) {
  try {
    if (txn.payment) {
      return (
        bigintToString(txn.payment.amount, 6) + (store.isVoi ? " Voi" : " Algo")
      );
    } else if (txn.assetTransfer) {
      const txnAsset = assets.find(
        (a) => a.index === txn.assetTransfer?.assetIndex
      );
      if (!txnAsset) throw Error("Asset Not Found");
      return `${bigintToString(
        txn.assetTransfer.amount,
        txnAsset.params.decimals
      )} ${txnAsset.params.unitName} (ID: ${txnAsset.index})`;
    }
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
    router.replace("/");
  }
}

function copyLink() {
  const baseUrl = store.isWeb ? location.origin : "https://lute.app";
  copyToClipboard(
    baseUrl + location.pathname.replace("/dist", "") + location.search
  );
}

function openExtension() {
  if (!reviewTxns.value) throw Error("Invalid Swap");
  window.dispatchEvent(
    new CustomEvent("lute-connect", {
      detail: { action: "swap", tx1, tx2 },
    })
  );
  store.setSnackbar("Opened in Extension", "info");
  router.replace("/");
}
</script>
