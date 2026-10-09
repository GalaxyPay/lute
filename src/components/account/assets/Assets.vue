<template>
  <div v-if="acct.canSign || acct.appId" class="asset-actions">
    <v-btn
      variant="outlined"
      size="small"
      text="Opt-In to Asset"
      :prepend-icon="mdiPlus"
      @click="show = true"
    />
    <v-btn
      variant="outlined"
      size="small"
      text="Opt-Out of Asset"
      :prepend-icon="mdiClose"
      :active="optOut"
      @click="optOut = !optOut"
    />
  </div>
  <div v-if="!acct.info?.assets?.length" class="empty-note">No Assets yet</div>
  <div v-if="!store.loading">
    <asset-card
      v-for="asset in acct.info?.assets"
      :key="Number(asset.assetId)"
      :acct="acct"
      :asset="asset"
      :opt-out="optOut"
    />
  </div>
  <v-dialog v-model="show" max-width="440" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Opt-In to Asset
        <v-spacer />
        <v-icon :icon="mdiClose" @click="closeDialog()" />
      </v-card-title>
      <v-form ref="form" @submit.prevent="optIn()">
        <v-card-text>
          <v-text-field
            v-model.number="assetId"
            type="number"
            label="Asset ID"
            density="comfortable"
            @update:model-value="getAsset()"
            :error-messages="assetError"
            :hint="asset?.params.name ?? ''"
            persistent-hint
            :rules="[required]"
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="flat" text="Opt-In" type="submit" />
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
<script lang="ts" setup>
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { priceTxns, send } from "@/utils";
import { luteSigner, reportSignError } from "@/utils/signers";
import { mdiClose, mdiPlus } from "@mdi/js";
import algosdk from "algosdk";

const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
});

const store = useAppStore();
const show = ref(false);
const optOut = ref(false);
const form = ref();
const assetId = ref();
const asset = ref();
const assetError = ref();

function closeDialog() {
  show.value = false;
  form.value.reset();
}
const required = (v: string) => !!v || "Required";

let assetTimeout: number;
async function getAsset() {
  assetError.value = undefined;
  window.clearTimeout(assetTimeout);
  assetTimeout = window.setTimeout(async () => {
    asset.value = assetId.value
      ? await Algo.algod
          .getAssetByID(assetId.value)
          .do()
          .catch(() => {
            asset.value = undefined;
            assetError.value = "Invalid Asset";
          })
      : undefined;
  }, 500);
}

async function optIn() {
  try {
    const { valid } = await form.value.validate();
    if (!valid || !asset.value) return;
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      assetIndex: assetId.value,
      receiver: props.acct.addr,
      sender: props.acct.addr,
      suggestedParams,
      amount: 0,
    });
    closeDialog();
    await priceTxns([txn], props.acct);
    const stxn = await luteSigner([txn]);
    await send(stxn, "Opted-In to Asset");
  } catch (err: any) {
    reportSignError(err);
  }
  store.overlay = false;
}
</script>

<style scoped>
.asset-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid rgb(var(--v-theme-border-subtle));
}
.empty-note {
  padding: 24px 18px;
  text-align: center;
  font-size: 13px;
  color: rgb(var(--v-theme-text-muted));
}
@media (max-width: 599.98px) {
  .asset-actions .v-btn {
    flex: 1;
    --v-btn-height: 44px;
  }
}
</style>

<style>
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
