<template>
  <v-container class="pt-0">
    <v-card v-if="!store.accounts.length" title="Set up your wallet">
      <v-card-text>
        Your wallet is not set up. Visit Lute to get started.
      </v-card-text>
      <v-container class="text-center">
        <v-btn text="Lute Home" @click="home()" />
      </v-container>
    </v-card>
    <v-card v-else>
      <div class="text-h5 pa-4">Connect to {{ siteName }}</div>
      <v-container>
        <v-data-table
          v-model="selected"
          item-value="addr"
          :loading="!!store.loading"
          :items="store.snoop ? store.acctInfo : store.sendAcctInfo"
          :headers="headers"
          items-per-page="-1"
          show-select
        >
          <template #headers />
          <template #bottom />
          <template #[`item.addr`]="{ item }">
            <v-row no-gutters align="center" class="flex-nowrap">
              <v-col cols="auto" class="pr-1">
                <account-icon :item />
              </v-col>
              <v-col cols="auto">
                <div :class="xxs && 'truncate'">
                  {{ item.name || item.ns?.name }}
                </div>
                <span :class="item.name || item.ns?.name ? 'text-grey' : ''">
                  {{ xxs ? item.title.substring(9, 0) : item.title }}
                </span>
              </v-col>
            </v-row>
          </template>
          <template #[`item.info.amount`]="{ value }">
            <span class="text-no-wrap mr-2">
              <span v-if="store.isVoi" class="font-weight-bold">V</span>
              <algo-icon v-else color="currentColor" :width="10" />
              {{ value != null ? bigintToString(value, 6, false, 2) : "-" }}
            </span>
          </template>
        </v-data-table>
        <v-row class="text-center mt-3">
          <v-col>
            <v-btn
              text="Connect"
              :disabled="!selected.length"
              @click="connect()"
            />
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import router from "@/router";
import {
  bigintToString,
  resetSidePanel,
  sendOrPostMessage,
  whenLoaded,
} from "@/utils";
import { useDisplay } from "vuetify";

const store = useAppStore();
const { width } = useDisplay();
const xxs = computed(() => width.value < 450);
const selected = ref([]);
const headers: any[] = [{ key: "addr" }, { key: "info.amount", align: "end" }];
const who = ref();
let genesisID: string | null;
let tabId: number | undefined;

onMounted(() => whenLoaded(ready));

async function ready() {
  if (store.isWeb) {
    window.opener.postMessage({ action: "ready", debug: store.debug }, "*");
    window.addEventListener("message", messageHandler);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    who.value = params.get("name");
    tabId = Number(params.get("tabId"));
    try {
      await browser.tabs.get(tabId);
    } catch {
      await resetSidePanel();
    }
    genesisID = params.get("genesisID");
    if (!genesisID) {
      throw Error("Invalid Network");
    }
    messageHandler({ data: { action: "network", genesisID } });
  }
}

const siteName = computed(() => {
  return store.isWeb ? window.name : who.value;
});

async function messageHandler(event: any) {
  try {
    if (store.isWeb && event.origin === location.origin) return;
    if (event.data.action === "network") {
      const network = store.allNetworks.find(
        (n) =>
          n.genesisID ===
          (event.data.genesisID === "sandnet-v1"
            ? "dockernet-v1"
            : event.data.genesisID)
      );
      if (store.debug) console.log("[Lute Debug]", network);
      if (!network) {
        throw Error(`Invalid Network ${event.data.genesisID}`);
      }
      store.networkName = network.name;
      store.refresh++;
    }
  } catch (err: any) {
    const message = {
      action: "error",
      message: err.message,
      debug: store.debug,
    };
    sendOrPostMessage(message, tabId);
    window.close();
  }
}

function home() {
  if (store.isWeb) {
    window.open("/", "_blank");
    window.close();
  } else {
    router.push("/");
  }
}

function connect() {
  const message = {
    action: "connect",
    addrs: [...selected.value],
    debug: store.debug,
  };
  sendOrPostMessage(message, tabId);
  window.close();
}

window.onbeforeunload = function () {
  const message = { action: "close", debug: store.debug };
  sendOrPostMessage(message, tabId);
};
</script>

<style>
.v-table > .v-table__wrapper > table > tbody > tr > td {
  padding: 0 4px;
}
</style>
