<template>
  <div class="tab-pane">
    <div v-if="ownedNfds?.length > 1" class="vault-select">
      <v-select
        v-model="nfd"
        :items="ownedNfds"
        item-title="name"
        return-object
        @update:model-value="getAssets()"
        hide-details
      />
    </div>
    <div
      v-if="vaultAssets && !vaultAssets.length"
      class="text-center text-muted text-body-2 py-4"
    >
      No Assets in your Vault
    </div>
    <div class="asset-grid">
      <vault-asset
        v-for="asset in vaultAssets"
        :key="Number(asset.assetId)"
        :nfd="nfd"
        :asset="asset"
        :acct="acct"
        @complete="emit('complete')"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import Algo from "@/services/Algo";
import { nfdsByAddress } from "@/services/NameService";
import type { AccountInfo } from "@/types";
import algosdk from "algosdk";

const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
});
const emit = defineEmits(["complete"]);

const vaultAssets = ref();
const ownedNfds = ref();
const nfd = ref(props.acct.ns!);

onMounted(async () => {
  ownedNfds.value = await nfdsByAddress(props.acct.addr);
  await getAssets();
});

async function getAssets() {
  const vaultAddr = algosdk.getApplicationAddress(nfd.value.appID!);
  vaultAssets.value = (
    await Algo.algod.accountInformation(vaultAddr).do()
  ).assets?.filter((a) => a.amount);
}
</script>

<style scoped>
.tab-pane {
  padding: 14px 18px 18px;
}
.vault-select {
  max-width: 280px;
  margin-bottom: 14px;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
</style>
