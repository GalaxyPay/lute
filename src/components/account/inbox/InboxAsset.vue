<template>
  <v-card class="fill-height" color="#2B2B2B">
    <v-container>
      <v-row>
        <v-col cols="2" align-self="center" class="pr-0 pl-2">
          <v-img contain max-width="60" :src="image" />
        </v-col>
        <v-col cols="10" class="py-1">
          <v-container>
            <v-row>
              {{ assetInfo?.params?.name || asset.assetId }}
              <v-icon
                v-if="asset.assetId"
                :icon="mdiInformationOutline"
                color="grey"
                class="pl-2"
                @click="exploreAsset()"
              />
              <v-spacer />
              <span class="mr-2">
                <v-icon
                  :icon="mdiCheck"
                  color="success"
                  size="small"
                  @click="claim()"
                />
                <v-tooltip activator="parent" text="Claim" location="top" />
              </span>
              <span>
                <v-icon
                  :icon="mdiClose"
                  color="error"
                  size="small"
                  @click="reject()"
                />
                <v-tooltip activator="parent" text="Reject" location="top" />
              </span>
            </v-row>
            <v-row class="text-caption">
              {{ formatAmount() }}
              {{ assetInfo?.params.unitName }}
            </v-row>
          </v-container>
        </v-col>
      </v-row>
    </v-container>
  </v-card>
</template>

<script lang="ts" setup>
import { Arc59Factory } from "@/clients/Arc59Client";
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { bigintToString, getAssetInfo, resolveProtocol } from "@/utils";
import { luteSigner } from "@/utils/signers";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { mdiCheck, mdiClose, mdiInformationOutline } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";

const store = useAppStore();
const props = defineProps({
  inboxInfo: {
    type: Object as PropType<modelsv2.Account>,
    required: true,
  },
  asset: {
    type: Object as PropType<modelsv2.AssetHolding>,
    required: true,
  },
  acct: { type: Object as PropType<AccountInfo>, required: true },
});
const emit = defineEmits(["complete"]);

const assetInfo = ref<modelsv2.Asset>();
const image = ref();

onMounted(async () => {
  assetInfo.value = await getAssetInfo(props.asset.assetId, true);
  if (assetInfo.value?.params.url) {
    image.value = await resolveProtocol(
      assetInfo.value.params.url,
      assetInfo.value.params.reserve || ""
    );
  }
});

function exploreAsset() {
  const url = store.network.explorer + "/asset/" + props.asset.assetId;
  window.open(url, "_blank");
}

function formatAmount() {
  return assetInfo.value
    ? bigintToString(props.asset.amount, assetInfo.value.params.decimals)
    : "-";
}

function getAppClient() {
  if (!store.network.inboxRouter) throw Error("Invalid Router");
  const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
  algorand.setDefaultSigner(luteSigner);
  algorand.setDefaultValidityWindow(1000);
  const factory = new Arc59Factory({
    defaultSender: props.acct.addr,
    algorand,
  });
  return factory.getAppClientById({ appId: BigInt(store.network.inboxRouter) });
}

async function claim() {
  try {
    const appClient = getAppClient();
    const composer = appClient.newGroup();
    const claimerOptedIn = props.acct.info?.assets?.some(
      (a) => a.assetId === props.asset.assetId
    );
    let totalTxns = 3n;
    if (props.inboxInfo.minBalance < props.inboxInfo.amount) {
      totalTxns += 2n;
      composer.arc59ClaimAlgo({ args: {}, staticFee: (0).algo() });
    }
    // If the claimer hasn't already opted in, add a transaction to do so
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    if (!claimerOptedIn) {
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: props.acct.addr,
        receiver: props.acct.addr,
        amount: 0,
        assetIndex: props.asset.assetId,
        suggestedParams,
      });
      composer.addTransaction(txn, luteSigner);
    }
    const fee = Number(suggestedParams.minFee * totalTxns).microAlgos();
    composer.arc59Claim({ args: { asa: props.asset.assetId }, staticFee: fee });
    await composer.send({ populateAppCallResources: true });
    store.refresh++;
    store.setSnackbar("Claimed Asset", "success");
    emit("complete");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}

async function reject() {
  try {
    const appClient = getAppClient();
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const fee = Number(suggestedParams.minFee * 3n).microAlgos();
    await appClient
      .newGroup()
      .arc59Reject({ args: { asa: props.asset.assetId }, staticFee: fee })
      .send({ populateAppCallResources: true });
    store.refresh++;
    store.setSnackbar("Rejected Asset", "success");
    emit("complete");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}
</script>
