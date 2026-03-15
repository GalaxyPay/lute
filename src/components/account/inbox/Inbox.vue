<template>
  <v-container>
    <v-row>
      <v-col
        v-for="asset in inboxInfo?.assets"
        :key="Number(asset.assetId)"
        cols="12"
        md="6"
        lg="4"
      >
        <inbox-asset
          :inbox-info="inboxInfo"
          :asset="asset"
          :acct="acct"
          @complete="emit('complete')"
        />
      </v-col>
    </v-row>
  </v-container>
</template>
<script lang="ts" setup>
import type { AccountInfo } from "@/types";
import { modelsv2 } from "algosdk";

defineProps({
  inboxInfo: {
    type: Object as PropType<modelsv2.Account>,
    required: true,
  },
  acct: { type: Object as PropType<AccountInfo>, required: true },
});
const emit = defineEmits(["complete"]);
</script>
