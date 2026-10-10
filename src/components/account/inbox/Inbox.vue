<template>
  <div class="tab-pane">
    <inbox-asset
      v-for="asset in inboxInfo?.assets"
      :key="Number(asset.assetId)"
      :inbox-info="inboxInfo"
      :asset="asset"
      :acct="acct"
      @complete="emit('complete')"
    />
  </div>
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

<style scoped>
.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 18px 18px;
}
</style>
