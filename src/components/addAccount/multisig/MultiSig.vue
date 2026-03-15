<template>
  <v-container class="pt-0">
    <v-tabs v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <create-msig @add="addMsigAccount" />
      </v-window-item>
      <v-window-item :value="1">
        <import-msig @add="addMsigAccount" />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import type { LuteAccount } from "@/types";
import { deepClone } from "@/utils";

const emit = defineEmits(["close"]);

const store = useAppStore();
const tab = ref(0);

async function addMsigAccount(val: {
  addr: string;
  appId: bigint;
  network: string;
}) {
  const accts: LuteAccount[] = deepClone(store.accounts);
  const idx = accts.findIndex(
    (a) => a.addr === val.addr && a.network === store.networkName
  );
  if (idx !== -1) accts[idx]!.appId = val.appId;
  else accts.push(val);
  await set("app", "accounts", accts);
  await store.getCache();
  store.refresh++;
  store.setSnackbar("Multi-Sig Imported", "success");
  emit("close");
}
</script>
