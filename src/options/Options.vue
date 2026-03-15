<template>
  <v-app>
    <AppBar />
    <v-main>
      <SettingsView @get-cache="getCache()" @get-theme="getTheme()" />
      <AddAccountDialog :visible="showAdd" @close="showAdd = false" />
      <SignDialog is-options />
    </v-main>
    <v-overlay v-model="store.overlay" persistent />
    <Snackbar v-if="!store.showDialogSnack" />
  </v-app>
</template>

<script lang="ts" setup>
import { get } from "@/dbLute";
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
  store.loading++;
  theme.change((await get("app", "theme")) || "dark");
  await setIcon(theme.name.value);
  await store.getCache();
  await refresh();
  store.loading--;
});

function getCache() {
  browser.runtime.sendMessage({ action: "getCache" });
}

function getTheme() {
  browser.runtime.sendMessage({ action: "getTheme" });
}

watch(
  () => store.refresh,
  async () => {
    await refresh();
    const info: MsgpackHD[] = store.info.map((i) => ({
      hd: { addrIdx: i.addrIdx, sibling: i.sibling },
      ai: Buffer.from(encodeMsgpack(i)).toString("base64"),
    }));
    browser.runtime.sendMessage({
      action: "optionsRefresh",
      info,
      nsObj: JSON.stringify(store.nsObj),
    });
  }
);
</script>
