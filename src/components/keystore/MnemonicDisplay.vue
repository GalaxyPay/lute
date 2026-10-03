<template>
  <div class="text-h6 pb-2 d-flex">
    Mnemonic: <v-spacer />
    <v-btn text="Copy" @click="copyToClipboard(words.join(' '))" />
  </div>
  <v-row style="font-family: monospace">
    <v-col
      v-for="(word, ix) in words"
      :key="ix"
      cols="6"
      sm="4"
      class="py-0"
    >
      <v-text-field
        :model-value="word"
        variant="plain"
        readonly
        hide-details
        density="compact"
      >
        <template #prepend>{{ ix < 9 ? "&nbsp;" + (ix + 1) : ix + 1 }}.</template>
      </v-text-field>
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
import { copyToClipboard } from "@/utils";

defineProps<{ words: string[] }>();
</script>
