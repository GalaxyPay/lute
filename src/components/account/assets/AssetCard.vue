<template>
  <div class="asset-row">
    <div class="asset-image">
      <v-img v-if="image" contain :src="image" width="100%" height="100%" />
      <span v-else>{{ initials }}</span>
    </div>
    <div class="flex-grow-1 min-w-0">
      <div class="asset-name">
        <span class="ellipsis">
          {{ assetInfo?.params?.name || asset.assetId }}
        </span>
        <a
          :href="store.network.explorer + '/asset/' + asset.assetId"
          target="_blank"
          class="d-inline-flex"
        >
          <v-icon :icon="mdiInformationOutline" size="14" class="text-icon" />
        </a>
      </div>
      <div class="address">
        {{ formatAmount() }}
        {{ assetInfo?.params?.unitName }}
      </div>
    </div>
    <div v-if="value !== undefined" class="amount asset-value">
      <algo-icon color="currentColor" :width="9" class="algo-glyph" />
      {{ formatAlgoValue(value) }}
    </div>
    <v-btn
      :icon="favorite ? mdiStar : mdiStarOutline"
      :color="favorite ? 'warning' : undefined"
      :class="!favorite && 'text-icon'"
      variant="text"
      size="small"
      :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'"
      :aria-pressed="favorite"
      @click="emit('toggleFavorite')"
    />
    <v-btn
      v-show="optOut"
      :icon="mdiClose"
      color="error"
      variant="text"
      size="small"
      aria-label="Opt-out of asset"
      @click="setReceiver()"
    />
    <!-- receiver dialog -->
    <v-dialog v-model="showReceiver" max-width="520">
      <v-card>
        <v-card-title class="d-flex">
          Choose receiver
          <v-spacer />
          <v-icon :icon="mdiClose" @click="showReceiver = false" />
        </v-card-title>
        <v-form ref="form" @submit.prevent="closeOut()">
          <v-card-text>
            <p class="mb-2">Where should the remainder of the asset go?</p>
            <v-text-field
              class="font-mono"
              v-model="receiver"
              :disabled="creator"
              label="Address"
              :rules="[required, validAddress]"
            />
            <v-checkbox
              v-show="asset.assetId"
              v-model="creator"
              label="Send back to creator"
              hide-details
            />
          </v-card-text>
          <v-card-actions>
            <v-btn variant="flat" text="Submit" type="submit" />
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import { algoValue, formatAlgoValue } from "@/services/Prices";
import type { AccountInfo } from "@/types";
import { bigintToString, priceTxns, resolveProtocol, send } from "@/utils";
import { luteSigner, reportSignError } from "@/utils/signers";
import {
  mdiClose,
  mdiInformationOutline,
  mdiStar,
  mdiStarOutline,
} from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";

const store = useAppStore();
const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
  asset: {
    type: Object as PropType<modelsv2.AssetHolding>,
    required: true,
  },
  assetInfo: { type: Object as PropType<modelsv2.Asset> },
  favorite: { type: Boolean },
  optOut: { type: Boolean },
});
const emit = defineEmits<{ toggleFavorite: [] }>();

const image = ref();
const form = ref();
const required = (v: string) => !!v || "Required";
const validAddress = (v: string) =>
  algosdk.isValidAddress(v) || "Invalid address";
const showReceiver = ref(false);
const receiver = ref();
const creator = ref(false);

watch(
  creator,
  (val) => (receiver.value = val ? props.assetInfo?.params?.creator : undefined)
);

watch(
  () => props.assetInfo,
  async (info) => {
    image.value = info?.params?.url
      ? await resolveProtocol(info.params.url, info.params.reserve || "")
      : undefined;
  },
  { immediate: true }
);

const initials = computed(() =>
  (props.assetInfo?.params?.unitName || props.assetInfo?.params?.name || "")
    .slice(0, 2)
    .toUpperCase()
);

const value = computed(() =>
  props.asset.amount
    ? algoValue(props.asset.assetId, props.asset.amount)
    : undefined
);

function formatAmount() {
  return props.assetInfo?.params
    ? bigintToString(props.asset.amount, props.assetInfo.params.decimals)
    : "-";
}

async function setReceiver() {
  if (!props.asset.amount) {
    receiver.value = props.acct.addr;
    closeOut();
  } else {
    showReceiver.value = true;
  }
}

async function closeOut() {
  if (props.asset.amount) {
    const { valid } = await form.value.validate();
    if (!valid) return;
  }
  try {
    showReceiver.value = false;
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: props.acct.addr,
      receiver: props.acct.addr,
      closeRemainderTo: receiver.value,
      amount: 0,
      assetIndex: props.asset.assetId,
      suggestedParams,
    });
    await priceTxns([txn], props.acct);
    const stxn = await luteSigner([txn]);
    await send(stxn, "Closed out of asset");
  } catch (err: any) {
    let message = err.message;
    if (err.status == 400)
      message = "Must close/destroy all assets and apps first.";
    reportSignError(err, message);
  }
  store.overlay = false;
}
</script>

<style scoped>
.asset-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 18px;
  border-bottom: 1px solid rgb(var(--v-theme-border-subtle));
}
.asset-image {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface-variant));
  overflow: hidden;
  font-size: 10px;
  font-weight: 600;
  color: rgb(var(--v-theme-text-body));
}
.asset-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
}
.asset-value {
  font-size: 13px;
  color: rgb(var(--v-theme-text-body));
}
.min-w-0 {
  min-width: 0;
}
</style>
