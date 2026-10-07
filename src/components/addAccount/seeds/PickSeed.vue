<template>
  <v-container v-if="!newSeed">
    <div class="pl-6">Your Seeds</div>
    <v-container class="pt-0">
      <v-data-table
        :items="rows"
        :headers="headers"
        class="no-select"
        items-per-page="-1"
        @click:row="(_e: any, row: { item: SeedRow }) => $emit('pick', row.item)"
        hover
      >
        <template #[`item.label`]="{ item }">
          {{ label(item).title }}
          <div class="text-grey text-caption">{{ label(item).caption }}</div>
        </template>
        <template #[`item.chip`]="{ item }">
          <v-chip v-if="item.credentialId" text="Passkey" size="x-small" />
          <v-chip
            v-else-if="!item.exportable"
            text="Legacy"
            size="x-small"
          />
          <v-btn
            v-if="removable(item)"
            :icon="mdiDelete"
            variant="text"
            size="small"
            title="Remove seed"
            @click.stop="removing = item"
          />
        </template>
        <template #headers />
        <template #bottom />
      </v-data-table>
    </v-container>
    <v-container class="text-center">
      <v-btn
        :prepend-icon="mdiPlusCircle"
        text="Add Seed"
        @click="newSeed = true"
      />
    </v-container>
  </v-container>
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
import { mdiDelete, mdiPlusCircle } from "@mdi/js";

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
