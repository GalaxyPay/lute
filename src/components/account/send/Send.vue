<template>
  <v-container class="py-6">
    <v-row justify="center">
      <v-col cols="12" sm="6">
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
    <Participation v-if="txnType?.key === 'keyreg'" :acct="acct" />
    <Swap v-else-if="txnType?.key === 'swap'" :sender="acct" />
    <Xfer v-else-if="txnType" :acct="acct" :txn-type="txnType" />
  </v-container>
</template>

<script setup lang="ts">
import type { AccountInfo, SendType } from "@/types";

defineProps<{ acct: AccountInfo }>();

const txnTypes: SendType[] = [
  { title: "Payment", key: "pay", fields: ["to", "amount", "note", "close"] },
  {
    title: "Asset Transfer",
    key: "axfer",
    fields: ["assetId", "to", "amount", "note", "close", "revoke"],
  },
  { title: "Key Registration", key: "keyreg" },
  { title: "Rekey", key: "rekey", fields: ["rekey", "note"] },
  { title: "Atomic Swap", key: "swap" },
];
const txnType = ref<SendType>();
</script>
