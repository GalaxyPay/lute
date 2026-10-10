<template>
  <v-container class="page">
    <v-card :loading="loading">
      <v-card-title>Atomic swap</v-card-title>
      <v-card-subtitle>
        Swap assets directly with another party - no middle-man or smart
        contract
      </v-card-subtitle>
      <v-container v-if="reviewTxns">
        <v-container class="text-center">
          <div class="font-mono">
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
          <v-btn variant="outlined" text="Copy link" @click="copyLink()" />
          <v-btn
            variant="flat"
            class="ml-2"
            text="Review & Sign"
            @click="accept()"
          />
          <v-row v-if="extensionDetected">
            <v-col class="pb-0">
              <v-btn text="Open in extension" @click="openExtension()" />
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
import { findNetwork } from "@/utils/networks";
import { luteSigner, reportSignError } from "@/utils/signers";
import { parseSwap } from "@/utils/swap";
import { modelsv2, Transaction } from "algosdk";

const store = useAppStore();

const reviewTxns = ref<Transaction[]>();
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
    const parsed = parseSwap(tx1, tx2);
    stxn1 = parsed.stxn1;
    const { txn1, txn2 } = parsed;
    const network = findNetwork(
      store.allNetworks,
      txn1.genesisID,
      txn1.genesisHash!.toBase64()
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
    await send([stxn1, resp[1]!], "Swap completed");
    router.replace("/");
  } catch (err: any) {
    reportSignError(err);
  }
}

function formatAsset(txn: Transaction) {
  try {
    if (txn.payment) {
      return (
        bigintToString(txn.payment.amount, 6) + (store.isVoi ? " Voi" : " Algo")
      );
    } else if (txn.assetTransfer) {
      const txnAsset = assets.find(
        (a) => a.index === txn.assetTransfer?.assetIndex
      );
      if (!txnAsset?.params) throw Error("Asset Not Found");
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
  store.setSnackbar("Opened in extension", "info");
  router.replace("/");
}
</script>
