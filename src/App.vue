<!--
  Lute - An Algorand Wallet
  Copyright (C) 2025  Galaxy Pay, LLC

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
-->

<template>
  <v-app>
    <AppBar />
    <AppNav />
    <v-main>
      <router-view />
      <SignDialog />
    </v-main>
    <v-overlay v-model="store.overlay" persistent />
    <Snackbar v-if="!store.showDialogSnack" />
  </v-app>
</template>

<script lang="ts" setup>
import { get, set } from "@/dbLute";
import router from "@/router";
import type { AccountHD, MsgpackHD } from "@/types";
import { fetchAsync, refresh, setIcon } from "@/utils";
import { decodeMsgpack, modelsv2 } from "algosdk";
import { useTheme } from "vuetify";

const store = useAppStore();
const theme = useTheme();

function optionsRefreshListener() {
  browser.runtime.onMessage.addListener(async (message: any) => {
    if (message?.action === "optionsRefresh") {
      await store.getCache();
      store.info = message.info.map((i: MsgpackHD) => {
        const ai: AccountHD = decodeMsgpack(
          Buffer.from(i.ai, "base64"),
          modelsv2.Account
        );
        ai.addrIdx = i.hd.addrIdx;
        ai.sibling = i.hd.sibling;
        return ai;
      });
      store.nsObj = JSON.parse(message.nsObj);
      goldCheck();
    }
    if (message?.action === "getCache") {
      store.getCache();
    }
    if (message?.action === "getTheme") {
      getTheme();
    }
  });
}

onBeforeMount(async () => {
  store.loading++;
  if (!store.isWeb) optionsRefreshListener();
  await getTheme();
  await setIcon(theme.name.value);
  await store.getCache();
  await router.isReady();
  if (!router.currentRoute.value.meta.modal) {
    store.refresh++;
    store.tinyman = await fetchAsync(
      "https://asa-list.tinyman.org/assets.json"
    );
  }
  store.loading--;
});

async function getTheme() {
  theme.change((await get("app", "theme")) || "dark");
}

async function goldCheck() {
  if (theme.name.value === "gold") {
    if (!store.isLutier && store.networkName.includes("MainNet")) {
      await setIcon("default");
      await set("app", "theme", "dark");
      theme.change("dark");
    }
  }
}

watch(
  () => store.refresh,
  async () => {
    await refresh();
    goldCheck();
  }
);
</script>
