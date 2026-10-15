<template>
  <span :class="plain ? 'acct-type' : 'tag'">{{ label }}</span>
</template>

<script setup lang="ts">
import type { AccountInfo } from "@/types";

// The account kind as a type tag, or as plain text in a row's address line.
const props = defineProps<{ item: AccountInfo; plain?: boolean }>();

const label = computed(() => {
  const item = props.item;
  if (item.appId) return "Multi-sig";
  if (item.subType === "hd") return "HD";
  if (item.subType === "rekey") return "Rekeyed";
  if (item.isHot) return "Algo25";
  if (item.seedId && item.slot != null) return "HD";
  if (item.slot != null) return "Ledger";
  if (item.isFalcon25) return "Falcon25";
  return "Watch";
});
</script>
