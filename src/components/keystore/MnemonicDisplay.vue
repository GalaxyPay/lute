<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-1">
      <span class="mnemonic-label">Mnemonic:</span>
      <v-btn
        size="small"
        class="mr-n3"
        :prepend-icon="mdiContentCopy"
        text="Copy"
        @click="copyToClipboard(words.join(' '))"
      />
    </div>
    <div class="mnemonic-grid">
      <div v-for="(word, ix) in words" :key="ix" class="mnemonic-word">
        <span class="mnemonic-num">{{ ix + 1 }}</span>
        <span>{{ word }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { copyToClipboard } from "@/utils";
import { mdiContentCopy } from "@mdi/js";

defineProps<{ words: string[] }>();
</script>

<style scoped>
.mnemonic-label {
  font-size: 12px;
  color: rgb(var(--v-theme-text-muted));
}
.mnemonic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  overflow: hidden;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: 10px;
  background: rgb(var(--v-theme-background));
}
.mnemonic-word {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  background: rgb(var(--v-theme-background));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-border));
  font: 13px var(--font-mono);
}
.mnemonic-num {
  width: 16px;
  font-size: 11px;
  color: rgb(var(--v-theme-text-dim));
}
</style>
