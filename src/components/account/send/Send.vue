<template>
  <v-container class="py-6">
    <v-row justify="center">
      <v-col cols="12" sm="5">
        <v-select
          v-model="txnType"
          label="Transaction Type"
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
  </v-container>
</template>

<script setup lang="ts">
import type { AccountInfo } from "@/types";

defineProps<{ acct: AccountInfo }>();

const txnTypes = [
  { title: "Transfer", key: "xfer" },
  { title: "Key Registration", key: "keyreg" },
  { title: "Atomic Swap", key: "swap" },
  { title: "Rekey", key: "rekey" },
];
const txnType = ref(txnTypes[0]);
</script>
