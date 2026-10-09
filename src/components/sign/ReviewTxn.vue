<template>
  <div class="review-txn">
    <div class="review-index">
      {{ `Transaction ${idx + 1}${toSign ? "" : " (Not to be Signed)"}:` }}
    </div>
    <div class="d-flex align-center ga-2 mt-1">
      <span class="review-type">{{ ftxn.type }}</span>
      <v-chip
        size="x-small"
        @click="viewRaw = !viewRaw"
        :text="viewRaw ? 'View summary' : 'View raw'"
      />
    </div>
    <pre v-show="viewRaw" class="review-raw">{{
      algosdk.encodeJSON(txn, { space: 2 })
    }}</pre>
    <dl v-show="!viewRaw" class="review-fields">
      <dt>From</dt>
      <dd>{{ ftxn.from }}</dd>
      <template v-if="ftxn.to">
        <dt>To</dt>
        <dd>{{ ftxn.to }}</dd>
      </template>
      <template v-if="ftxn.clawbackFrom">
        <dt>Clawback from</dt>
        <dd :class="toSign ? 'text-error-text' : ''">
          {{ ftxn.clawbackFrom }}
        </dd>
      </template>
      <template v-if="ftxn.appId">
        <dt>App ID</dt>
        <dd>{{ ftxn.appId }}</dd>
      </template>
      <template v-if="ftxn.asset">
        <dt>Asset</dt>
        <dd>{{ ftxn.asset }}</dd>
      </template>
      <template v-if="ftxn.amount">
        <dt>Amount</dt>
        <dd>{{ ftxn.amount }}</dd>
      </template>
      <dt>Fee</dt>
      <dd :class="txn.fee > feeWarn && toSign ? 'text-warning' : ''">
        {{ ftxn.fee }}
      </dd>
      <template v-if="ftxn.voteFirst">
        <dt>First vote round</dt>
        <dd>{{ ftxn.voteFirst }}</dd>
      </template>
      <template v-if="ftxn.voteLast">
        <dt>Last vote round</dt>
        <dd>{{ ftxn.voteLast }}</dd>
      </template>
      <template v-if="ftxn.voteKeyDilution">
        <dt>Key dilution</dt>
        <dd>{{ ftxn.voteKeyDilution }}</dd>
      </template>
      <template v-if="ftxn.selectionKey">
        <dt>Selection key</dt>
        <dd>{{ ftxn.selectionKey }}</dd>
      </template>
      <template v-if="ftxn.voteKey">
        <dt>Voting key</dt>
        <dd>{{ ftxn.voteKey }}</dd>
      </template>
      <template v-if="ftxn.stateProofKey">
        <dt>State proof key</dt>
        <dd>{{ ftxn.stateProofKey }}</dd>
      </template>
      <template v-if="ftxn.rekeyTo">
        <dt>RekeyTo</dt>
        <dd :class="toSign ? 'text-error-text' : ''">{{ ftxn.rekeyTo }}</dd>
      </template>
      <template v-if="ftxn.closeRemainderTo">
        <dt>CloseRemainderTo</dt>
        <dd :class="toSign ? 'text-error-text' : ''">
          {{ ftxn.closeRemainderTo }}
        </dd>
      </template>
      <template v-if="ftxn.note?.length">
        <dt>Note</dt>
        <dd>{{ ftxn.note }}</dd>
      </template>
    </dl>
  </div>
</template>

<script lang="ts" setup>
import { formatTxn } from "@/utils/formatTxn";
import algosdk, { modelsv2 } from "algosdk";

const props = defineProps({
  txn: { type: algosdk.Transaction, required: true },
  idx: { type: Number, required: true },
  toSign: { type: Boolean, required: true },
  assets: { type: Array<modelsv2.Asset>, required: true },
});

const store = useAppStore();
const viewRaw = ref(false);

const isFalcon25 = store.acctInfo.find(
  (ai) => ai.addr === props.txn.sender.toString()
)?.isFalcon25;
const feeWarn = isFalcon25 ? 3000 : 1000;

const txnAsset = computed(() =>
  props.assets.find((a) => a.index === props.txn.assetTransfer?.assetIndex)
);

const ftxn = computed(() =>
  formatTxn(props.txn, txnAsset.value, store.isVoi ? "VOI" : "ALGO")
);
</script>

<style scoped>
.review-txn {
  padding: 12px 0;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}
.review-index {
  font-size: 12.5px;
  color: rgb(var(--v-theme-info));
}
.review-type {
  font-size: 15px;
  font-weight: 500;
}
.review-raw {
  margin-top: 8px;
  max-height: 320px;
}
.review-fields {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 4px;
  margin-top: 8px;
  font-size: 12.5px;
}
.review-fields dt {
  color: rgb(var(--v-theme-text-dim));
}
.review-fields dd {
  font-family: var(--font-mono);
  word-break: break-all;
}
</style>
