<template>
  <v-container>
    <v-row v-if="ownedNfds?.length > 1" justify="center" class="py-2">
      <v-col cols="10" sm="8" md="6" lg="4">
        <v-select
          v-model="nfd"
          :items="ownedNfds"
          item-title="name"
          return-object
          @update:model-value="getAssets()"
          hide-details
        />
      </v-col>
    </v-row>
    <v-row v-if="vaultAssets && !vaultAssets.length">
      <v-col class="text-center text-body-2 font-italic">
        No Assets in your Vault
      </v-col>
    </v-row>
    <v-row>
      <v-col
        v-for="asset in vaultAssets"
        :key="Number(asset.assetId)"
        cols="12"
        md="6"
        lg="4"
      >
        <vault-asset
          :nfd="nfd"
          :asset="asset"
          :acct="acct"
          @complete="emit('complete')"
        />
      </v-col>
    </v-row>
  </v-container>
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
