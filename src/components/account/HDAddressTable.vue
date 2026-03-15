<template>
  <v-container>
    <v-data-table
      :items="addrs"
      :headers="headers"
      class="no-select"
      items-per-page="-1"
      hover
      @click:row="acctDetails"
    >
      <template #headers />
      <template #bottom />
      <template #[`item.address`]="{ item }">
        <div
          style="font-family: monospace"
          :class="isAdded(item.address) ? '' : 'text-grey'"
        >
          {{ item.address }}
        </div>
        <div class="text-grey text-caption">
          {{ `44'/283'/${acct.slot}'/0/${item.addrIdx}` }}
        </div>
      </template>
      <template #[`item.actions`]="{ item }">
        <v-icon
          v-if="isAdded(item.address)"
          :icon="mdiMinus"
          color="primary"
          @click.stop="removeFromWallet(item.addrIdx)"
        />
        <v-icon
          v-else
          :icon="mdiPlus"
          color="primary"
          @click.stop="addToWallet(item.addrIdx)"
        />
      </template>
    </v-data-table>
  </v-container>
  <v-container class="text-center">
    <v-row>
      <v-col>
        <v-btn
          @click="getAddrs(addrs.length + 1)"
          :append-icon="mdiChevronDown"
          text="Load more addresses"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import router from "@/router";
import HdWallet from "@/services/HdWallet";
import type { AccountInfo, LuteAccount } from "@/types";
import { deepClone } from "@/utils";
import { mdiChevronDown, mdiMinus, mdiPlus } from "@mdi/js";

const props = defineProps({
  acct: { type: Object as PropType<AccountInfo>, required: true },
});

const store = useAppStore();
const headers: any[] = [
  { key: "address", sortable: false },
  { key: "actions", align: "end", sortable: false },
];

const addrs = ref<{ address: string; addrIdx: number }[]>([]);

async function getAddrs(startIndex: number) {
  if (props.acct.xpub)
    for (let i = startIndex; i < 4 + startIndex; i++) {
      const address = await HdWallet.deriveAddr(props.acct.xpub, i);
      if (address !== props.acct.addr)
        addrs.value.push({
          address,
          addrIdx: i,
        });
    }
}

watch(
  () => props.acct.addr,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      addrs.value = [];
      getAddrs(1);
    }
  },
  { immediate: true }
);

function isAdded(addr: string) {
  return store.acctInfo.some((acct) => acct.addr === addr);
}

async function addToWallet(addrIdx: number) {
  const aix = store.accounts.findIndex((a) => a.addr === props.acct.addr);
  if (aix === -1) throw Error("Invalid Account");
  const x = deepClone(store.accounts[aix]) as LuteAccount;
  if (!x.idxs) x.idxs = [];
  if (!x.idxs.includes(addrIdx)) x.idxs.push(addrIdx);
  x.idxs.sort();
  const newVal = deepClone(store.accounts.toSpliced(aix, 1, x));
  await set("app", "accounts", newVal);
  await store.getCache();
  store.refresh++;
  store.setSnackbar("Added to wallet", "success");
}

async function removeFromWallet(addrIdx: number) {
  const aix = store.accounts.findIndex((a) => a.addr === props.acct.addr);
  if (aix === -1) throw Error("Invalid Account");
  const x = deepClone(store.accounts[aix]) as LuteAccount;
  if (!x.idxs) throw Error("Invalid Indexes");
  const ix = x.idxs.indexOf(addrIdx);
  if (ix !== -1) {
    x.idxs.splice(ix, 1);
    const newVal = deepClone(store.accounts.toSpliced(aix, 1, x));
    await set("app", "accounts", newVal);
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Removed from wallet", "success");
  }
}

function acctDetails(_event: any, row: any) {
  if (isAdded(row.item.address)) router.push(row.item.address);
}
</script>
