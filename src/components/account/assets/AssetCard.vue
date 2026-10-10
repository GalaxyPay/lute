<template>
  <div class="asset-row">
    <v-avatar size="28" color="surface-selected" class="asset-avatar">
      <v-img v-if="image" :src="image" />
      <span v-else>{{ initials }}</span>
    </v-avatar>
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
import type { AccountInfo } from "@/types";
import {
  bigintToString,
  getAssetInfo,
  priceTxns,
  resolveProtocol,
  send,
} from "@/utils";
import { luteSigner, reportSignError } from "@/utils/signers";
import { mdiClose, mdiInformationOutline } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";

const store = useAppStore();
const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
  asset: {
    type: Object as PropType<modelsv2.AssetHolding>,
    required: true,
  },
  optOut: { type: Boolean },
});

const assetInfo = ref<modelsv2.Asset>();
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
  (val) => (receiver.value = val ? assetInfo.value?.params?.creator : undefined)
);

onMounted(async () => {
  assetInfo.value = await getAssetInfo(props.asset.assetId);
  if (assetInfo.value?.params?.url) {
    image.value = await resolveProtocol(
      assetInfo.value.params.url,
      assetInfo.value.params.reserve || ""
    );
  }
});

const initials = computed(() =>
  (assetInfo.value?.params?.unitName || assetInfo.value?.params?.name || "")
    .slice(0, 2)
    .toUpperCase()
);

function formatAmount() {
  return assetInfo.value?.params
    ? bigintToString(props.asset.amount, assetInfo.value.params.decimals)
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
.asset-avatar {
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
.min-w-0 {
  min-width: 0;
}
</style>
