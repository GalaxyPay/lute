<template>
  <div class="dialog-body">
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
        <span class="font-mono">{{ formatAddr(item.address) }}</span>
        <div class="text-dim text-caption">
          {{
            `${item.assets?.length} asset${
              item.assets?.length === 1 ? "" : "s"
            }`
          }}
        </div>
      </template>
      <template #[`item.amount`]="{ value }">
        <span class="amount">
          <span v-if="store.isVoi">V </span>{{ bigintToString(value, 6) }}
        </span>
      </template>
    </v-data-table>
  </div>
  <v-card-actions>
    <v-btn
      variant="flat"
      text="Add to wallet"
      :disabled="!selected.length || loading"
      @click="addAccounts()"
    />
  </v-card-actions>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import Keystore from "@/services/Keystore";
import type { LuteAccount, Unlocker } from "@/types";
import { bigintToString, formatAddr, isCancelled } from "@/utils";
import algosdk, { type Account, modelsv2 } from "algosdk";

const selected = ref([]);
const loading = ref(false);
const headers: any[] = [
  { title: "Select all", key: "address", sortable: false },
  { key: "amount", align: "end", sortable: false },
];

const store = useAppStore();
const unlocker = ref<Unlocker>();
const accts = ref<Account[]>();
const accounts = ref<modelsv2.Account[]>([]);
const emit = defineEmits(["close"]);

// The exported keys are secrets: zero them once this is done with them.
onBeforeUnmount(() => accts.value?.forEach((a) => a.sk.fill(0)));

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
  const plaintexts: Uint8Array[] = [];
  try {
    const add = (selected.value as string[])
      .filter((a) => !store.accounts.some((acct) => acct.addr === a))
      .map((a) => {
        const acct = accts.value?.find((acct) => acct.addr.toString() === a);
        if (!acct) throw Error("Invalid Account");
        return acct;
      });
    const mk = await unlocker.value!.ensureMk();
    await Keystore.putSecrets(
      mk,
      add.map((acct) => {
        const plaintext = acct.sk.slice(0, 32);
        plaintexts.push(plaintext);
        return {
          kind: "algo25" as const,
          form: "seed" as const,
          id: `algo25:${acct.addr}`,
          plaintext,
        };
      }),
      {
        accounts: (current: LuteAccount[]) =>
          current.concat(
            add
              .map((acct) => acct.addr.toString())
              .filter((addr) => !current.some((c) => c.addr === addr))
              .map((addr) => ({ addr }))
          ),
      }
    );
    await store.getCache();
    store.refresh++;
    emit("close");
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    plaintexts.forEach((p) => p.fill(0));
  }
}
</script>
