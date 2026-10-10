<template>
  <div class="send-tab">
    <v-row justify="center" no-gutters>
      <v-col cols="12" sm="5">
        <v-select
          v-model="txnType"
          label="Transaction type"
          placeholder="Choose a type..."
          persistent-placeholder
          :items="txnTypes"
          density="comfortable"
          return-object
          hide-details
        />
      </v-col>
    </v-row>
    <template v-if="txnType">
      <Xfer
        v-if="['xfer', 'rekey'].includes(txnType.key)"
        :acct="acct"
        :rekey="txnType.key === 'rekey'"
      />
      <Participation v-if="txnType.key === 'keyreg'" :acct="acct" />
      <Swap v-else-if="txnType.key === 'swap'" :sender="acct" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AccountInfo } from "@/types";

defineProps<{ acct: AccountInfo }>();

const txnTypes = [
  { title: "Transfer", key: "xfer" },
  { title: "Key registration", key: "keyreg" },
  { title: "Atomic swap", key: "swap" },
  { title: "Rekey", key: "rekey" },
];
const txnType = ref(txnTypes[0]);
</script>

<style scoped>
.send-tab {
  padding-top: 4px;
}
.send-tab > .v-row {
  padding: 0 18px;
}
</style>
