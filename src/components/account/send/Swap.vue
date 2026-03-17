<template>
  <v-form v-if="!reviewTxns" ref="form" @submit.prevent="propose()">
    <v-container class="px-0 pt-6">
      <v-row justify="center">
        <v-col cols="12" sm="6">
          <v-autocomplete
            v-model="senderAsset"
            :items="senderAssets"
            :item-props="assetProps"
            label="Your Asset"
            :rules="[required]"
            persistent-hint
            autocomplete="off"
            variant="outlined"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="sendAmount"
            type="number"
            label="Your Amount"
            autocomplete="off"
            :rules="[required]"
          />
        </v-col>
        <v-col cols="12">
          <v-combobox
            :class="theirClass"
            v-model="receiver"
            :items="nsLookups"
            :item-props="receiverProps"
            :return-object="false"
            label="Their Account"
            :placeholder="`Address${ns}`"
            persistent-placeholder
            spellcheck="false"
            @keyup="lookupNs(receiver)"
            :rules="[required, validAddress]"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-autocomplete
            :class="theirClass"
            v-model="receiverAsset"
            :items="receiverAssets"
            :item-props="assetProps"
            label="Their Asset"
            :rules="[required]"
            persistent-hint
            variant="outlined"
            autocomplete="off"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            :class="theirClass"
            v-model="receiveAmount"
            type="number"
            label="Their Amount"
            :rules="[required]"
            autocomplete="off"
          />
        </v-col>
      </v-row>
    </v-container>
    <v-container class="text-center">
      <div class="text-caption text-grey">
        To propose a swap you'll sign the first transaction - this transaction
        will not be valid unless the second transaction is signed by the
        receiver
      </div>
    </v-container>
    <v-card-actions>
      <v-spacer />
      <v-btn text="Propose Swap" type="submit" />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import router from "@/router";
import Algo from "@/services/Algo";
import NameService from "@/services/NameService";
import type { AccountInfo, NsLookup } from "@/types";
import { b64url, getAssetInfo, stringToBigint } from "@/utils";
import { luteSigner } from "@/utils/signers";
import algosdk, { modelsv2 } from "algosdk";
import { useTheme } from "vuetify";

const props = defineProps<{ sender: AccountInfo }>();

const store = useAppStore();
const theme = useTheme();
const ns = store.network.nfdUrl
  ? " or NFD"
  : store.network.envoiUrl
    ? " or EnVoi"
    : "";

const theirClass = computed(
  () => `text-blue-${theme.name.value == "light" ? "darken-2" : "lighten-2"}`
);

const form = ref();
const required = (v: any) => !!v || v === 0 || "Required";
const validAddress = (v: string) =>
  algosdk.isValidAddress(v) || "Invalid Address";

const receiver = ref<string>();
const nsLookups = ref<NsLookup[]>();
const senderAssets = ref<modelsv2.Asset[]>([store.nativeAsset]);
const senderAsset = ref<modelsv2.Asset>();
const receiverAssets = ref<modelsv2.Asset[]>([store.nativeAsset]);
const receiverAsset = ref<modelsv2.Asset>();
const sendAmount = ref();
const receiveAmount = ref();

defineExpose({
  senderAsset,
  sendAmount,
  receiver,
  receiverAsset,
  receiveAmount,
});

watch(
  () => props.sender,
  async (val) => {
    senderAssets.value = [store.nativeAsset];
    senderAsset.value = undefined;
    sendAmount.value = undefined;
    if (!val?.info?.assets) return;
    await Promise.all(
      val.info.assets.map(async (a) => {
        if (a.amount > 0) {
          const asset = await getAssetInfo(a.assetId, true);
          if (asset) senderAssets.value.push(asset);
        }
      })
    );
  },
  { immediate: true }
);

watch(receiver, async (val) => {
  if (!val || !algosdk.isValidAddress(val)) return;
  receiverAssets.value = [store.nativeAsset];
  receiverAsset.value = undefined;
  receiveAmount.value = undefined;
  const info = await Algo.algod.accountInformation(val).do();
  if (!info.assets) return;
  await Promise.all(
    info.assets.map(async (a) => {
      if (a.amount > 0) {
        const asset = await getAssetInfo(a.assetId, true);
        if (asset) receiverAssets.value.push(asset);
      }
    })
  );
});

function receiverProps(item: any) {
  return {
    subtitle: !algosdk.isValidAddress(item?.title) ? item?.value : undefined,
  };
}
function assetProps(item: modelsv2.Asset) {
  return {
    title: item.params.name,
    subtitle: item.index ? Number(item.index) : "",
  };
}

const reviewTxns = ref<algosdk.Transaction[]>();

let nsTimeout: number;
async function lookupNs(q: string | undefined) {
  window.clearTimeout(nsTimeout);
  nsTimeout = window.setTimeout(async () => {
    nsLookups.value = q ? await NameService.search(q) : [];
  }, 500);
}

async function propose() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  try {
    const suggestedParams = await Algo.algod.getTransactionParams().do();

    let txn1: algosdk.Transaction;
    if (!senderAsset.value?.index) {
      txn1 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: props.sender.addr,
        receiver: receiver.value!,
        suggestedParams,
        amount: stringToBigint(sendAmount.value, 6),
      });
    } else {
      txn1 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        assetIndex: senderAsset.value.index,
        sender: props.sender.addr,
        receiver: receiver.value!,
        suggestedParams,
        amount: stringToBigint(
          sendAmount.value,
          senderAsset.value.params.decimals
        ),
      });
    }
    let txn2: algosdk.Transaction;
    if (!receiverAsset.value?.index) {
      txn2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: receiver.value!,
        receiver: props.sender.addr,
        suggestedParams,
        amount: stringToBigint(receiveAmount.value, 6),
      });
    } else {
      txn2 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        assetIndex: receiverAsset.value.index,
        sender: receiver.value!,
        receiver: props.sender.addr,
        suggestedParams,
        amount: stringToBigint(
          receiveAmount.value,
          receiverAsset.value.params.decimals
        ),
      });
    }
    algosdk.assignGroupID([txn1, txn2]);
    const resp = await luteSigner([txn1, txn2], [0]);
    store.snackbar.display = false;
    const query = {
      tx1: b64url(Buffer.from(resp[0]!).toString("base64")),
      tx2: b64url(Buffer.from(txn2.toByte()).toString("base64")),
    };
    form.value?.reset();
    await router.push({ path: "/swap", query });
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}
</script>
