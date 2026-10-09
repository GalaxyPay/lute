<template>
  <div class="asset-tile">
    <div class="asset-image">
      <v-img v-if="image" contain :src="image" />
    </div>
    <div class="flex-grow-1 min-w-0">
      <div class="asset-name">
        <span class="ellipsis">
          {{ assetInfo?.params?.name || asset.assetId }}
        </span>
        <v-icon
          v-if="asset.assetId"
          :icon="mdiInformationOutline"
          size="14"
          class="clickable"
          @click="exploreAsset()"
        />
      </div>
      <div class="address">
        {{ formatAmount() }}
        {{ assetInfo?.params?.unitName }}
      </div>
    </div>
    <v-btn size="small" color="error" text="Reject" @click="reject()" />
    <v-btn size="small" text="Claim" @click="claim()" />
  </div>
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
import { mdiInformationOutline } from "@mdi/js";
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

<style scoped>
.asset-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgb(var(--v-theme-border));
  background: rgb(var(--v-theme-background));
}
.asset-image {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface-variant));
  overflow: hidden;
}
.asset-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
}
.min-w-0 {
  min-width: 0;
}
</style>
