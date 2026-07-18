<template>
  <v-container class="pt-0">
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
      <v-tab v-if="store.networkName === 'LocalNet'" text="KMD" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <new-key
          :number-of-words="25"
          @hide-tabs="hideTabs = true"
          @close="$emit('close')"
        />
      </v-window-item>
      <v-window-item :value="1">
        <import-key
          :number-of-words="25"
          button-text="Import"
          @mn="handleMnemonic"
        />
      </v-window-item>
      <v-window-item v-if="store.networkName === 'LocalNet'" :value="2">
        <import-kmd @close="$emit('close')" />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import type { LuteAccount } from "@/types";
import { deepClone, storeKey } from "@/utils";
import algosdk from "algosdk";

const emit = defineEmits(["close"]);
const store = useAppStore();
const tab = ref(0);
const hideTabs = ref(false);

async function handleMnemonic(mn: string) {
  try {
    const acct = algosdk.mnemonicToSecretKey(mn);
    await storeKey(acct);
    const accts: LuteAccount[] = deepClone(store.accounts);
    if (accts.some((a) => a.addr === acct.addr.toString())) {
      emit("close");
      throw Error("Account Already Exists In Wallet");
    }
    accts.push({ addr: acct.addr.toString() });
    await set("app", "accounts", accts);
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Account Imported", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
