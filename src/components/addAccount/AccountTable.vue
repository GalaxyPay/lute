<template>
  <div class="pick-body">
    <v-data-table
      v-model="selected"
      :loading="loading"
      :items="accounts"
      :headers="headers"
      items-per-page="-1"
      :item-selectable="(item: AccountSubs) => !added.includes(item.address)"
      show-select
      return-object
      class="pick-table"
    >
      <template v-if="loading && !accounts.length" #headers />
      <!-- Only before the first batch: a loading slot replaces existing rows. -->
      <template v-if="!accounts.length" #loading>
        <v-progress-linear indeterminate height="3" class="mb-1" />
        <v-skeleton-loader type="list-item-two-line@4" />
      </template>
      <template #bottom />
      <template #[`item.address`]="{ item, index }">
        <div class="pick-address">
          {{ formatAddr(item.address) }}
          <v-chip
            v-if="added.includes(item.address)"
            text="Added"
            color="text-muted"
            size="x-small"
          />
        </div>
        <div class="address">{{ `44'/283'/${index}'/0/0` }}</div>
      </template>
      <template #[`item.amount`]="{ item }">
        <div class="amount">
          <span v-if="store.isVoi">V </span>{{ bigintToString(item.amount, 6) }}
        </div>
        <div class="text-dim text-caption">
          {{
            `${item.assets?.length} asset${
              item.assets?.length === 1 ? "" : "s"
            }` +
            (item.subs?.length
              ? `, ${item.subs.length} sub-account${
                  item.subs.length === 1 ? "" : "s"
                }`
              : "")
          }}
        </div>
      </template>
    </v-data-table>
    <div class="pick-links">
      <v-btn
        v-show="!loading || accounts.length"
        size="small"
        :disabled="loading"
        @click="$emit('getAddrs', accounts.length)"
        :append-icon="mdiChevronDown"
        text="Load more accounts"
      />
      <slot name="links" />
    </div>
  </div>
  <v-card-actions>
    <v-btn
      variant="flat"
      text="Add to wallet"
      :disabled="!selected.length || loading"
      @click="$emit('addAccounts', selected)"
    />
  </v-card-actions>
</template>

<script lang="ts" setup>
import type { AccountSubs } from "@/types";
import { formatAddr, bigintToString } from "@/utils";
import { mdiChevronDown } from "@mdi/js";

const props = defineProps({
  accounts: {
    type: Array as PropType<AccountSubs[]>,
    default: [] as AccountSubs[],
  },
  // Addresses from this seed already in the wallet.
  added: { type: Array as PropType<string[]>, default: () => [] },
  preselect: { type: Object as PropType<AccountSubs> },
  loading: { type: Boolean, default: false },
});

defineEmits(["getAddrs", "addAccounts"]);

const store = useAppStore();
const selected = ref<AccountSubs[]>([]);

// Rows arrive after mount, so the next unused account is selected once known.
watch(
  () => props.preselect,
  (acct) => {
    if (acct && !selected.value.length) selected.value = [acct];
  },
  { immediate: true }
);
const headers: any[] = [
  { title: "Select all", key: "address", sortable: false },
  { key: "amount", align: "end", sortable: false },
];
</script>

<style scoped>
.pick-body {
  padding: 14px 12px 4px;
}
.pick-table :deep(tbody tr) {
  height: 56px;
}
.pick-table :deep(td),
.pick-table :deep(th) {
  padding: 6px 12px !important;
  border-bottom: none !important;
}
.pick-table :deep(th) {
  height: 36px !important;
  font-size: 13px;
  font-weight: 400;
  color: rgb(var(--v-theme-text-muted));
}
.pick-address {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 13.5px var(--font-mono);
}
.pick-links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
}
</style>
