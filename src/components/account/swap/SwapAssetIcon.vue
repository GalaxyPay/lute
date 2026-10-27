<template>
  <div
    class="swap-asset-icon"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <v-img v-if="logo && !failed" :src="logo" cover @error="failed = true" />
    <algo-icon v-else-if="id === 0n" color="currentColor" :width="size / 2" />
    <span v-else>{{ unit.slice(0, 2).toUpperCase() }}</span>
  </div>
</template>

<script lang="ts" setup>
const props = withDefaults(
  defineProps<{ id: bigint; unit: string; size?: number }>(),
  { size: 24 }
);
const store = useAppStore();

// Swaps are MainNet only, where Tinyman's list has the logos (ALGO included).
const logo = computed(() => store.tinyman?.[Number(props.id)]?.logo.png);
const failed = ref(false);
watch(logo, () => (failed.value = false));
</script>

<style scoped>
.swap-asset-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface-variant));
  overflow: hidden;
  font-size: 9px;
  font-weight: 600;
  color: rgb(var(--v-theme-text-body));
}
</style>
