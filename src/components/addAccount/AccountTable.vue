<template>
  <v-container>
    <v-data-table
      v-model="selected"
      :loading="loading"
      :items="accounts"
      :headers="headers"
      items-per-page="-1"
      show-select
      return-object
    >
      <template v-if="loading && !accounts.length" #headers />
      <template #bottom />
      <template #[`item.address`]="{ item, index }">
        {{ formatAddr(item.address) }}
        <div class="text-grey text-caption">
          {{ `44'/283'/${index}'/0/0` }}
        </div>
      </template>
      <template #[`item.amount`]="{ item }">
        <span v-if="store.isVoi" class="font-weight-bold">V</span>
        <algo-icon v-else color="currentColor" :width="10" />
        {{ bigintToString(item.amount, 6) }}
        <div class="text-grey">
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
  </v-container>
  <v-container class="text-center">
    <v-row>
      <v-col>
        <v-btn
          v-show="!loading || accounts.length"
          :disabled="loading"
          @click="$emit('getAddrs', accounts.length)"
          :append-icon="mdiChevronDown"
          text="Load more accounts"
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <v-btn
          text="Add to Wallet"
          :disabled="!selected.length || loading"
          @click="$emit('addAccounts', selected)"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import type { AccountSubs } from "@/types";
import { formatAddr, bigintToString } from "@/utils";
import { mdiChevronDown } from "@mdi/js";

defineProps({
  accounts: {
    type: Array as PropType<AccountSubs[]>,
    default: [] as AccountSubs[],
  },
  loading: { type: Boolean, default: false },
});

defineEmits(["getAddrs", "addAccounts"]);

const store = useAppStore();
const selected = ref<AccountSubs[]>([]);
const headers: any[] = [
  { title: "Select All", key: "address", sortable: false },
  { key: "amount", align: "end", sortable: false },
];
</script>
