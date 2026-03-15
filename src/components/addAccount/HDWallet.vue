<template>
  <account-table
    v-if="accounts.length"
    :accounts="accounts"
    @get-addrs="getAddrs"
    @add-accounts="addAccounts"
  />
  <pick-seed v-else @seed="handleSeed" />
</template>

<script lang="ts" setup>
import { getAll } from "@/dbLute";
import HdWallet from "@/services/HdWallet";
import type { AccountSubs, SeedData } from "@/types";
import { deepClone } from "@/utils";
import { openDB } from "idb";

const emit = defineEmits(["close"]);

const store = useAppStore();
const accounts = ref<AccountSubs[]>([]);
let seed: Buffer;
let seedId: number;
const seeds = ref<SeedData[]>([]);

onBeforeMount(async () => {
  seeds.value = await getAll("seeds");
});

async function getAddrs(startIndex: number = 0) {
  const accts = await HdWallet.deriveAccts(seed, startIndex);
  accounts.value = accounts.value.concat(accts);
  store.snackbar.display = false;
}

async function addAccounts(selected: AccountSubs[]) {
  seed.fill(0);
  const add = selected
    .filter((a) => !store.accounts.some((acct) => acct.addr === a.address))
    .map((a) => ({
      addr: a.address,
      slot: accounts.value.findIndex((acct) => acct.address === a.address),
      seedId,
      xpub: a.xpub,
    }));
  const newVal = deepClone(store.accounts.concat(add));
  const dbLute = await openDB("lute");
  await dbLute.put("app", newVal, "accounts");
  await store.getCache();
  store.refresh++;
  emit("close");
}

async function handleSeed(id: number, data: Buffer) {
  seedId = id;
  seed = data;
  getAddrs();
}
</script>
