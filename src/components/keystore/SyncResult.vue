<template>
  <v-card-text>{{ summary }}</v-card-text>
  <v-card-text v-if="warning" class="pt-0 text-warning">{{
    warning
  }}</v-card-text>
  <v-card-text v-if="skipped.length" class="pt-0">
    <div class="pb-1 text-text-body text-body-2">Not included:</div>
    <div v-for="s in skipped" :key="s.addr" class="text-caption">
      <span class="font-mono">{{ formatAddr(s.addr) }}</span>
      <span class="text-dim ml-2">{{ s.reason }}</span>
    </div>
  </v-card-text>
</template>

<script lang="ts" setup>
import type { Skipped } from "@/services/Transfer";
import { formatAddr } from "@/utils";

defineProps<{ summary: string; skipped: Skipped[]; warning?: string }>();
</script>
