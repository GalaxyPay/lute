<template>
  <v-card-text>{{ summary }}</v-card-text>
  <v-card-text v-if="skipped.length" class="pt-0">
    <div class="pb-1">Not included:</div>
    <div v-for="s in skipped" :key="s.addr" style="font-size: 0.8em">
      <span style="font-family: monospace">{{ formatAddr(s.addr) }}</span>
      <span class="text-grey"> {{ s.reason }}</span>
    </div>
  </v-card-text>
</template>

<script lang="ts" setup>
import type { Skipped } from "@/services/Transfer";
import { formatAddr } from "@/utils";

defineProps<{ summary: string; skipped: Skipped[] }>();
</script>
