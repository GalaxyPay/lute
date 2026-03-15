<template>
  <v-container>
    <v-data-table
      v-model="selected"
      item-value="address"
      :loading="loading"
      :items="accounts"
      :headers="headers"
      items-per-page="-1"
      show-select
    >
      <template v-if="loading && !accounts.length" #headers />
      <template #bottom />
      <template #[`item.address`]="{ item }">
        {{ formatAddr(item.address) }}
        <div class="text-grey">
          {{
            `${item.assets?.length} asset${
              item.assets?.length === 1 ? "" : "s"
            }`
          }}
        </div>
      </template>
      <template #[`item.amount`]="{ value }">
        <span v-if="store.isVoi" class="font-weight-bold">V</span>
        <algo-icon v-else color="currentColor" :width="10" />
        {{ bigintToString(value, 6) }}
      </template>
    </v-data-table>
  </v-container>
  <v-container class="text-center">
    <v-row>
      <v-col>
        <v-btn
          text="Add to Wallet"
          :disabled="!selected.length || loading"
          @click="addAccounts()"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import Algo from "@/services/Algo";
import { bigintToString, deepClone, formatAddr, storeKey } from "@/utils";
import algosdk, { type Account, modelsv2 } from "algosdk";

const selected = ref([]);
const loading = ref(false);
const headers: any[] = [
  { title: "Select All", key: "address", sortable: false },
  { key: "amount", align: "end", sortable: false },
];

const store = useAppStore();
const accts = ref<Account[]>();
const accounts = ref<modelsv2.Account[]>([]);
const emit = defineEmits(["close"]);

onMounted(async () => {
  try {
    loading.value = true;
    const { wallets } = await Algo.kmd.listWallets();
    const { id } = wallets.find(
      (w: any) => w.name === "unencrypted-default-wallet"
    );
    if (!id) throw Error("No unencrypted-default-wallet");
    const { wallet_handle_token } = await Algo.kmd.initWalletHandle(id, "");
    const { addresses } = await Algo.kmd.listKeys(wallet_handle_token);
    const keys: { private_key: Uint8Array }[] = [];
    await Promise.all(
      addresses.map(async (addr: string) => {
        const key = await Algo.kmd.exportKey(wallet_handle_token, "", addr);
        keys.push(key);
        const ai = await Algo.algod.accountInformation(addr).do();
        accounts.value.push(ai);
      })
    );
    accts.value = keys.map((k) => ({
      addr: new algosdk.Address(k.private_key.slice(32)),
      sk: k.private_key,
    }));
    Algo.kmd.releaseWalletHandle(wallet_handle_token);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
    emit("close");
  }
  loading.value = false;
});

async function addAccounts() {
  const add = selected.value
    .filter((a) => !store.accounts.some((acct) => acct.addr === a))
    .map((a) => {
      const acct = accts.value?.find((acct) => acct.addr.toString() === a);
      if (!acct) throw Error("Invalid Account");
      storeKey(acct);
      return {
        addr: a,
        hot: true,
      };
    });
  const newVal = deepClone(store.accounts.concat(add));
  await set("app", "accounts", newVal);
  await store.getCache();
  store.refresh++;
  emit("close");
}
</script>
