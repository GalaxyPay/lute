<template>
  <account-table
    :accounts="accounts"
    :loading="loading"
    @get-addrs="getLedgerAddresses"
    @add-accounts="addAccounts"
  />
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import Algo, { getAuthAccts } from "@/services/Algo";
import type { AccountSubs } from "@/types";
import { deepClone } from "@/utils";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { AlgorandApp } from "ledger-algorand-js";

const store = useAppStore();
const loading = ref(false);
const accounts = ref<AccountSubs[]>([]);

const emit = defineEmits(["close"]);

onMounted(() => getLedgerAddresses(0));

async function getLedgerAddresses(startIndex: number) {
  try {
    loading.value = true;
    const t = store.device.transport;
    if (!t) {
      store.setSnackbar("This browser does not support Ledger", "error");
      emit("close");
      return;
    }
    const hidOrUsb = t === "hid" ? TransportWebHID : TransportWebUSB;
    const transport = store.ledgerSelect
      ? await hidOrUsb.request()
      : await hidOrUsb.create();
    const algoApp = new AlgorandApp(transport);
    const accts: AccountSubs[] = [];
    const indexer = Algo.indexer;
    for (let i = startIndex; i < 4 + startIndex; i++) {
      await algoApp.getAddressAndPubKey(i).then(async (resp) => {
        const addr = resp.address.toString();
        const ai: AccountSubs = await Algo.algod.accountInformation(addr).do();
        const aa = await getAuthAccts(addr, indexer);
        ai.subs = aa;
        accts.push(ai);
      });
    }
    accounts.value = accounts.value.concat(accts);
    await transport.close();
  } catch (err: any) {
    if (store.device.transport) {
      const devices = await navigator[store.device.transport].getDevices();
      const openDevices = devices.filter((d: any) => d.opened);
      if (openDevices.length) await openDevices[0]?.close();
    }
    console.error(err);
    store.setSnackbar(err.message, "error");
    emit("close");
  }
  loading.value = false;
}

async function addAccounts(selected: AccountSubs[]) {
  const add = selected
    .filter((a) => !store.accounts.some((acct) => acct.addr === a.address))
    .map((a) => ({
      addr: a.address,
      slot: accounts.value.findIndex((acct) => acct.address === a.address),
    }));
  const newVal = deepClone(store.accounts.concat(add));
  await set("app", "accounts", newVal);
  await store.getCache();
  store.refresh++;
  emit("close");
}
</script>
