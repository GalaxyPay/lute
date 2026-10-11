<template>
  <div v-if="acct.info?.assets?.length" class="asset-filter">
    <v-text-field
      v-model="filter"
      placeholder="Search assets"
      density="compact"
      variant="outlined"
      :prepend-inner-icon="mdiMagnify"
      clearable
      hide-details
    />
  </div>
  <div v-if="acct.canSign || acct.appId" class="asset-actions">
    <v-btn
      variant="outlined"
      size="small"
      text="Opt-in to asset"
      :prepend-icon="mdiPlus"
      @click="show = true"
    />
    <v-btn
      variant="outlined"
      size="small"
      text="Opt-out of asset"
      :prepend-icon="mdiClose"
      :active="optOut"
      @click="optOut = !optOut"
    />
  </div>
  <div v-if="!acct.info?.assets?.length" class="empty-note">No assets yet</div>
  <div v-else-if="!assets.length" class="empty-note">No matching assets</div>
  <div v-if="!store.loading">
    <asset-card
      v-for="asset in assets"
      :key="Number(asset.assetId)"
      :acct="acct"
      :asset="asset"
      :asset-info="infos[Number(asset.assetId)]"
      :favorite="favorites.includes(Number(asset.assetId))"
      :opt-out="optOut"
      @toggle-favorite="
        store.toggleFavoriteAsset(acct.addr, Number(asset.assetId))
      "
    />
  </div>
  <v-dialog v-model="show" max-width="440" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Opt-in to asset
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
          <v-btn variant="flat" text="Opt-in" type="submit" />
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>
<script lang="ts" setup>
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { getAssetInfo, priceTxns, send } from "@/utils";
import { luteSigner, reportSignError } from "@/utils/signers";
import { mdiClose, mdiMagnify, mdiPlus } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";

const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
});

const store = useAppStore();
const show = ref(false);
const optOut = ref(false);
const filter = ref("");
// Asset params by id, loaded here so the list can filter on names.
const infos = ref<Record<number, modelsv2.Asset | undefined>>({});

watch(
  () => store.networkName,
  () => (infos.value = {})
);
watch(
  () => props.acct.info?.assets?.map((a) => a.assetId),
  (ids) => {
    // A network switch replaces the map, dropping lookups still in flight.
    const map = infos.value;
    ids?.forEach(async (id) => {
      const num = Number(id);
      if (num in map) return;
      map[num] = undefined;
      map[num] = await getAssetInfo(id);
      // Failed lookups retry on the next refresh.
      if (!map[num]) delete map[num];
    });
  },
  { immediate: true }
);

const favorites = computed(
  () => store.favoriteAssets[store.favoritesKey(props.acct.addr)] || []
);
const assets = computed(() => {
  const q = filter.value?.trim().toLowerCase();
  const list = (props.acct.info?.assets || []).filter((a) => {
    if (!q) return true;
    const params = infos.value[Number(a.assetId)]?.params;
    return [params?.name, params?.unitName, String(a.assetId)].some((s) =>
      s?.toLowerCase().includes(q)
    );
  });
  // Favorites first, each group keeping the account's order.
  const fav = (a: modelsv2.AssetHolding) =>
    favorites.value.includes(Number(a.assetId));
  return [...list.filter(fav), ...list.filter((a) => !fav(a))];
});
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
            assetError.value = "Invalid asset";
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
    await send(stxn, "Opted-in to asset");
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
.asset-filter {
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
