<template>
  <span v-if="store.hideBalances" class="masked" aria-label="Hidden">
    {{ PLACEHOLDER }}
  </span>
  <template v-else>{{ text }}</template>
</template>

<script lang="ts" setup>
// Blurs a fixed placeholder rather than the value itself, so neither the
// digits nor the length (the magnitude) can be read through the blur, and
// the value is not in the DOM to copy.
const PLACEHOLDER = "0,000.00";
defineProps<{ text: string }>();
const store = useAppStore();
</script>

<style scoped>
.masked {
  filter: blur(6px);
  user-select: none;
  pointer-events: none;
}
</style>
