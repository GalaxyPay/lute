<template>
  <template v-if="!newSeed">
    <div class="seed-body">
      <div class="seed-label">Your seeds</div>
      <v-data-table
        :items="rows"
        :headers="headers"
        class="no-select seed-table"
        items-per-page="-1"
        @click:row="
          (_e: any, row: { item: SeedRow }) => $emit('pick', row.item)
        "
        hover
      >
        <template #[`item.label`]="{ item }">
          <div class="seed-title">{{ label(item).title }}</div>
          <div v-if="label(item).caption" class="text-dim text-caption">
            {{ label(item).caption }}
          </div>
        </template>
        <template #[`item.chip`]="{ item }">
          <div class="d-flex align-center justify-end ga-2">
            <v-chip v-if="item.credentialId" text="Passkey" size="x-small" />
            <v-chip v-else-if="!item.exportable" text="Legacy" size="x-small" />
            <v-btn
              v-if="removable(item)"
              :icon="mdiDelete"
              variant="text"
              size="small"
              title="Remove seed"
              @click.stop="removing = item"
            />
            <v-icon :icon="mdiChevronRight" size="18" class="text-icon" />
          </div>
        </template>
        <template #headers />
        <template #bottom />
      </v-data-table>
    </div>
    <v-card-actions>
      <v-btn
        variant="outlined"
        :prepend-icon="mdiPlus"
        text="Add seed"
        @click="newSeed = true"
      />
    </v-card-actions>
  </template>
  <local-seed v-else @seed="(id, seed) => $emit('seed', id, seed)" />
  <remove-seed
    :row="removing"
    @close="removing = undefined"
    @removed="$emit('removed')"
  />
</template>

<script setup lang="ts">
import type { SeedRow } from "@/types";
import { formatAddr } from "@/utils";
import { mdiChevronRight, mdiDelete, mdiPlus } from "@mdi/js";

defineProps({
  rows: { type: Array as PropType<SeedRow[]>, required: true },
});

defineEmits(["pick", "seed", "removed"]);

const store = useAppStore();
const newSeed = ref(false);
const removing = ref<SeedRow>();
const headers: any[] = [
  { key: "label", sortable: false },
  { key: "chip", sortable: false, align: "end" },
];

function seedAccounts(row: SeedRow) {
  return store.accounts.filter((a) => a.seedId === row.id && a.slot != null);
}

// Only a seed no account uses, and not a 1.x seed still under its own
// password, which cannot prove its mnemonic.
function removable(row: SeedRow) {
  return !row.legacy && !seedAccounts(row).length;
}

// Seeds have no name, so one is identified by its first account.
function label(row: SeedRow) {
  const accts = seedAccounts(row).sort((a, b) => a.slot! - b.slot!);
  if (!accts.length) return { title: `Seed #${row.id}`, caption: "" };
  const n = accts.length;
  return {
    title: formatAddr(accts[0].addr),
    caption: `${n} account${n === 1 ? "" : "s"}`,
  };
}
</script>

<style scoped>
.seed-body {
  padding: 16px 12px 8px;
}
.seed-label {
  padding: 0 14px 8px;
  font-size: 13px;
  color: rgb(var(--v-theme-text-muted));
}
.seed-table :deep(tbody tr) {
  height: 56px;
}
.seed-table :deep(td) {
  padding: 0 10px 0 14px !important;
  border-bottom: none !important;
}
.seed-table :deep(tbody tr:hover td) {
  background: rgb(var(--v-theme-surface-variant)) !important;
}
.seed-table :deep(tbody tr td:first-child) {
  border-radius: 9px 0 0 9px;
}
.seed-table :deep(tbody tr td:last-child) {
  border-radius: 0 9px 9px 0;
}
.seed-title {
  font: 500 13.5px var(--font-mono);
}
</style>
