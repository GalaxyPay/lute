<template>
  <div v-if="loading">
    <v-progress-linear indeterminate height="3" />
    <v-skeleton-loader type="list-item-two-line@3" />
  </div>
  <v-data-table
    v-else
    :items="txns"
    :headers="headers"
    class="no-select txn-table"
    items-per-page="25"
    @click:row="txnDetails"
    hover
  >
    <template #headers />
    <template #no-data>{{ noData }}</template>
    <template #[`item.col1`]="{ item }">
      <div class="txn-action">{{ formatAction(item) }}</div>
      <div class="txn-target">{{ formatTarget(item) }}</div>
    </template>
    <template #[`item.col2`]="{ item }">
      <div class="txn-when">
        {{ new Date(Number(item.roundTime) * 1000).toLocaleString() }}
      </div>
      <div class="amount txn-amount">
        <template v-if="item.paymentTransaction">
          <span v-if="store.isVoi" class="font-weight-bold">V </span>
          <algo-icon
            v-else
            color="currentColor"
            :width="10"
            class="algo-glyph"
          />
        </template>
        {{ formatAmount(item) }}
      </div>
    </template>
  </v-data-table>
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
const noData = ref("No transactions yet");

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
    if (!asset?.params) throw Error("Invalid Asset");
    return `${bigintToString(axfer.amount, asset.params.decimals)} ${
      asset.params.unitName
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

<style scoped>
.txn-table :deep(tbody tr) {
  height: 56px;
}
.txn-table :deep(td) {
  padding: 8px 18px !important;
}
.txn-table :deep(td:last-child) {
  text-align: right;
}
.txn-action {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-text-dim));
}
.txn-target {
  margin-top: 3px;
  font: 13px var(--font-mono);
}
.txn-when {
  font-size: 11.5px;
  color: rgb(var(--v-theme-text-dim));
  white-space: nowrap;
}
.txn-amount {
  margin-top: 3px;
  font-size: 13.5px;
}
.txn-table :deep(.v-data-table-footer) {
  padding: 8px 12px;
  font-size: 12.5px;
  color: rgb(var(--v-theme-text-muted));
}
</style>
