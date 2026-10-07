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
              {{ assetInfo?.params?.unitName }}
            </v-row>
          </v-container>
        </v-col>
      </v-row>
    </v-container>
  </v-card>
</template>

<script lang="ts" setup>
import Inbox from "@/services/Inbox";
import type { AccountInfo } from "@/types";
import {
  bigintToString,
  getAssetInfo,
  priceTxns,
  resolveProtocol,
  send,
} from "@/utils";
import { luteSigner, reportSignError } from "@/utils/signers";
import { mdiCheck, mdiClose, mdiInformationOutline } from "@mdi/js";
import { modelsv2 } from "algosdk";

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
  if (assetInfo.value?.params?.url) {
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
  return assetInfo.value?.params
    ? bigintToString(props.asset.amount, assetInfo.value.params.decimals)
    : "-";
}

async function claim() {
  try {
    const claimerOptedIn = !!props.acct.info?.assets?.some(
      (a) => a.assetId === props.asset.assetId
    );
    const { txns, feeIndexes } = await Inbox.claimTxns(
      props.acct.addr,
      props.asset.assetId,
      claimerOptedIn,
      props.inboxInfo
    );
    const stxns = await luteSigner(
      await priceTxns(txns, props.acct, feeIndexes)
    );
    await send(stxns, "Claimed Asset");
    emit("complete");
  } catch (err: any) {
    reportSignError(err);
  }
  store.overlay = false;
}

async function reject() {
  try {
    const txns = await Inbox.rejectTxns(props.acct.addr, props.asset.assetId);
    const stxns = await luteSigner(await priceTxns(txns, props.acct));
    await send(stxns, "Rejected Asset");
    emit("complete");
  } catch (err: any) {
    reportSignError(err);
  }
  store.overlay = false;
}
</script>
