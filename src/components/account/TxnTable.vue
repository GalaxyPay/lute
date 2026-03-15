<template>
  <v-container v-if="loading" class="text-center my-10">
    <v-progress-circular :size="60" color="primary" indeterminate />
  </v-container>
  <v-container v-else>
    <v-data-table
      :items="txns"
      :headers="headers"
      class="no-select"
      items-per-page="25"
      @click:row="txnDetails"
      hover
    >
      <template #headers />
      <template #no-data>
        <i>{{ noData }}</i>
      </template>
      <template #[`item.col1`]="{ item }">
        <div class="text-caption text-grey text-uppercase">
          {{ formatAction(item) }}
        </div>
        <div>{{ formatTarget(item) }}</div>
      </template>
      <template #[`item.col2`]="{ item }">
        <div class="text-caption text-grey text-right">
          {{ new Date(Number(item.roundTime) * 1000).toLocaleString() }}
        </div>
        <div class="text-right">
          <span v-if="item.paymentTransaction">
            <span v-if="store.isVoi" class="font-weight-bold">V</span>
            <algo-icon v-else color="currentColor" :width="10" />
          </span>
          {{ formatAmount(item) }}
        </div>
      </template>
    </v-data-table>
  </v-container>
</template>
<script lang="ts" setup>
import Algo from "@/services/Algo";
import NameService from "@/services/NameService";
import type { AccountInfo, NsObject } from "@/types";
import { bigintToString, formatAddr, getAssetInfo, whenLoaded } from "@/utils";
import { indexerModels, modelsv2 } from "algosdk";
import type { PropType } from "vue";

const store = useAppStore();
const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
});
const loading = ref(false);
const headers: any[] = [{ key: "col1" }, { key: "col2" }];
const txns = ref<indexerModels.Transaction[]>([]);
const assets = ref<modelsv2.Asset[]>([]);
const nsRecords = ref<NsObject>({});
const noData = ref("No Transactions yet");

const addrs = computed(() => {
  const sends = txns.value.map((txn) => txn.sender);
  const pays = txns.value
    .map((txn) => txn.paymentTransaction?.receiver)
    .filter((a) => a);
  const axfers = txns.value
    .map((txn) => txn.assetTransferTransaction?.receiver)
    .filter((a) => a);
  const uniques = [...new Set([...sends, ...pays, ...axfers])];
  return uniques as string[];
});

onMounted(async () => {
  loading.value = true;
  await whenLoaded(getTxns);
  loading.value = false;
});

async function getTxns() {
  if (!Algo.indexer) {
    noData.value = "No indexer configured";
    return;
  }
  txns.value = (
    await Algo.indexer.lookupAccountTransactions(props.acct.addr).do()
  ).transactions;
  await Promise.all(
    txns.value
      .filter((txn) => txn.assetTransferTransaction)
      .map(async (txn) => {
        const asset = await getAssetInfo(
          txn.assetTransferTransaction!.assetId,
          true
        );
        if (asset) {
          assets.value.push(asset);
        }
      })
  );
  nsRecords.value = await NameService.reverseLookup(addrs.value);
}

function formatAction(txn: indexerModels.Transaction) {
  if (txn.paymentTransaction || txn.assetTransferTransaction) {
    return `${txn.paymentTransaction ? "Payment" : "Asset"}
    ${txn.sender === props.acct?.info?.address ? "To" : "From"}`;
  } else if (txn.applicationTransaction) {
    return `Application ${txn.applicationTransaction.onCompletion}`;
  } else if (txn.assetConfigTransaction) {
    return "Asset Config";
  } else if (txn.keyregTransaction) {
    return "Key Registration";
  } else if (txn.heartbeatTransaction) {
    return "Heartbeat";
  }
}

function formatTarget(txn: indexerModels.Transaction) {
  if (txn.applicationTransaction) {
    return (
      txn.applicationTransaction.applicationId || txn.createdApplicationIndex
    );
  } else if (txn.assetConfigTransaction) {
    return txn.assetConfigTransaction.assetId || txn.createdAssetIndex;
  } else if (txn.sender === props.acct?.info?.address) {
    if (txn.paymentTransaction)
      return (
        nsRecords.value[txn.paymentTransaction.receiver]?.name ||
        formatAddr(txn.paymentTransaction.receiver)
      );
    else if (txn.assetTransferTransaction)
      return (
        nsRecords.value[txn.assetTransferTransaction.receiver]?.name ||
        formatAddr(txn.assetTransferTransaction.receiver)
      );
  } else return nsRecords.value[txn.sender]?.name || formatAddr(txn.sender);
}

function formatAmount(txn: indexerModels.Transaction) {
  if (txn.paymentTransaction) {
    return bigintToString(txn.paymentTransaction.amount, 6);
  } else if (txn.assetTransferTransaction) {
    const axfer = txn.assetTransferTransaction;
    const asset = assets.value.find((a) => a.index === axfer.assetId);
    if (!asset) throw Error("Invalid Asset");
    return `${bigintToString(axfer.amount, asset.params.decimals)} ${
      asset?.params.unitName
    }`;
  }
}

function txnDetails(_event: any, row: any) {
  const stub = store.network.explorer.includes("allo")
    ? "/tx/"
    : "/transaction/";
  const url = store.network.explorer + stub + row.item.id;
  window.open(url, "_blank");
}

watch(
  () => store.refresh,
  () => getTxns()
);
</script>
