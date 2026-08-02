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
import { get } from "@/dbLute";
import Sync from "@/services/Sync";
import Unlock from "@/services/Unlock";
import type { MsgpackHD } from "@/types";
import { refresh, setIcon } from "@/utils";
import { encodeMsgpack } from "algosdk";
import { useTheme } from "vuetify";

const store = useAppStore();
const theme = useTheme();
const showAdd = ref(false);

onBeforeMount(async () => {
  browser.runtime.onMessage.addListener(async (message: any) => {
    if (message === "addAccount") {
      showAdd.value = true;
    }
  });
  browser.runtime.sendMessage("optionsReady");
  Sync.watch(reload);
  Unlock.watch();
  store.loading++;
  await getTheme();
  await setIcon(theme.name.value);
  await store.getCache();
  await refresh();
  store.loading--;
});

async function getTheme() {
  theme.change((await get("app", "theme")) || "dark");
}

// Theme is the one piece of cached state that does not live in the store: it
// is read straight out of IDB into Vuetify, so the shell has to reload it.
async function reload() {
  await store.getCache();
  await getTheme();
}

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
