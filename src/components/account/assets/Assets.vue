<template>
  <v-container>
    <v-row v-if="acct.canSign || acct.appId">
      <v-col class="text-center">
        <v-btn
          text="Opt-In to Asset"
          :prepend-icon="mdiPlusCircle"
          @click="show = true"
          class="pr-7"
        />
        <v-btn
          text="Opt-Out of Asset"
          :prepend-icon="mdiCloseCircle"
          @click="optOut = !optOut"
        />
      </v-col>
    </v-row>
    <v-row v-if="!acct.info?.assets?.length">
      <v-col class="text-center text-body-2 font-italic"> No Assets yet </v-col>
    </v-row>
    <v-row v-if="!store.loading">
      <v-col
        v-for="asset in acct.info?.assets"
        :key="Number(asset.assetId)"
        cols="12"
        md="6"
        lg="4"
      >
        <asset-card :acct="acct" :asset="asset" :opt-out="optOut" />
      </v-col>
    </v-row>
  </v-container>
  <v-dialog v-model="show" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Opt-In to Asset
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="closeDialog()" />
      </v-card-title>
      <v-form ref="form" @submit.prevent="optIn()">
        <v-container>
          <v-row justify="center">
            <v-col cols="8">
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
            </v-col>
          </v-row>
          <v-card-actions>
            <v-spacer />
            <v-btn text="Opt-In" type="submit" />
          </v-card-actions>
        </v-container>
      </v-form>
    </v-card>
  </v-dialog>
</template>
<script lang="ts" setup>
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { send } from "@/utils";
import { luteSigner } from "@/utils/signers";
import { mdiClose, mdiCloseCircle, mdiPlusCircle } from "@mdi/js";
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
    const stxn = await luteSigner([txn]);
    await send(stxn, "Opted-In to Asset");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}
</script>

<style>
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
