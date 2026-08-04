<template>
  <v-app>
    <AppBar />
    <v-main>
      <SettingsView />
      <AddAccountDialog :visible="showAdd" @close="showAdd = false" />
      <SignDialog is-options />
    </v-main>
    <v-overlay v-model="store.overlay" persistent />
    <Snackbar v-if="!store.showDialogSnack" />
  </v-app>
</template>

<script lang="ts" setup>
import Sync from "@/services/Sync";
import Unlock from "@/services/Unlock";
import type { MsgpackHD } from "@/types";
import { refresh } from "@/utils";
import { encodeMsgpack } from "algosdk";

const store = useAppStore();
const showAdd = ref(false);

onBeforeMount(async () => {
  browser.runtime.onMessage.addListener(async (message: any) => {
    if (message === "addAccount") {
      showAdd.value = true;
    }
  });
  browser.runtime.sendMessage("optionsReady");
  Sync.watch(store.getCache);
  Unlock.watch();
  store.loading++;
  await store.getCache();
  await refresh();
  store.loading--;
});

watch(
  () => store.refresh,
  async () => {
    await refresh();
    const info: MsgpackHD[] = store.info.map((i) => ({
      hd: { addrIdx: i.addrIdx, sibling: i.sibling },
      ai: encodeMsgpack(i).toBase64(),
    }));
    browser.runtime.sendMessage({
      action: "optionsRefresh",
      info,
      nsObj: JSON.stringify(store.nsObj),
    });
  }
);
</script>
