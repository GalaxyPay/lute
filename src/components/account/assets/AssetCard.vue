<template>
  <v-card class="fill-height" color="cardSecondary">
    <v-container>
      <v-row>
        <v-col cols="2" align-self="center" class="pr-0 pl-2">
          <v-img contain max-width="60" :src="image" />
        </v-col>
        <v-col :cols="optOut ? 9 : 10" class="py-1">
          <v-container>
            <v-row no-gutters>
              <v-col class="pa-0">
                <v-row>
                  {{ assetInfo?.params?.name || asset.assetId }}
                  <a
                    :href="store.network.explorer + '/asset/' + asset.assetId"
                    target="_blank"
                  >
                    <v-icon
                      :icon="mdiInformationOutline"
                      color="grey"
                      class="pl-2"
                    />
                  </a>
                </v-row>
                <v-row class="text-caption">
                  {{ formatAmount() }}
                  {{ assetInfo?.params.unitName }}
                </v-row>
              </v-col>
            </v-row>
          </v-container>
        </v-col>
        <v-col cols="1" v-show="optOut" class="pt-0 pl-0 pr-1 text-right">
          <v-icon
            :icon="mdiClose"
            color="error"
            size="x-small"
            @click="setReceiver()"
          />
        </v-col>
      </v-row>
    </v-container>
    <!-- receiver dialog -->
    <v-dialog v-model="showReceiver" max-width="600">
      <v-card>
        <v-card-title class="d-flex">
          Choose Receiver
          <v-spacer />
          <v-icon :icon="mdiClose" size="small" @click="showReceiver = false" />
        </v-card-title>
        <v-card-text> Where should the remainder of the asset go? </v-card-text>
        <v-form ref="form" @submit.prevent="closeOut()">
          <v-container>
            <v-text-field
              v-model="receiver"
              :disabled="creator"
              label="Address"
              :rules="[required, validAddress]"
              style="font-family: monospace"
            />
            <v-checkbox
              v-show="asset.assetId"
              v-model="creator"
              label="Send back to creator"
              hide-details
            />
          </v-container>
          <v-card-actions>
            <v-spacer />
            <v-btn text="Submit" type="submit" />
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { bigintToString, getAssetInfo, resolveProtocol, send } from "@/utils";
import { luteSigner } from "@/utils/signers";
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
  algosdk.isValidAddress(v) || "Invalid Address";
const showReceiver = ref(false);
const receiver = ref();
const creator = ref(false);

watch(
  creator,
  (val) => (receiver.value = val ? assetInfo.value?.params.creator : undefined)
);

onMounted(async () => {
  assetInfo.value = await getAssetInfo(props.asset.assetId);
  if (assetInfo.value?.params.url) {
    image.value = await resolveProtocol(
      assetInfo.value.params.url,
      assetInfo.value.params.reserve || ""
    );
  }
});

function formatAmount() {
  return assetInfo.value
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
    const stxn = await luteSigner([txn]);
    await send(stxn, "Closed Out of Asset");
  } catch (err: any) {
    console.error(err);
    let message = err.message;
    if (err.status == 400)
      message = "Must close/destroy all Assets and Apps first.";
    store.setSnackbar(message, "error");
  }
  store.overlay = false;
}
</script>
