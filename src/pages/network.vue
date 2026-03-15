<template>
  <v-container class="pt-0">
    <v-card :loading="loading" :disabled="loading">
      <template v-if="!loading">
        <div class="text-h5 pa-4">
          {{ `${siteName} wants to add a Network to your Lute configuration` }}
        </div>
        <v-container>
          <v-row>
            <v-col>
              <pre style="overflow: auto; font-size: 0.75em">{{ network }}</pre>
            </v-col>
          </v-row>
          <v-row class="text-center">
            <v-col>
              <v-btn text="Add" @click="addNetwork()" />
            </v-col>
          </v-row>
        </v-container>
      </template>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import { networks } from "@/data";
import { set } from "@/dbLute";
import {
  deepClone,
  resetSidePanel,
  sendOrPostMessage,
  whenLoaded,
} from "@/utils";

const store = useAppStore();
const loading = ref(true);
const network = ref();

let tabId: number | undefined;
let who: string | null;

const siteName = computed(() => {
  return store.isWeb ? window.name : who;
});

onMounted(() => whenLoaded(ready));

async function ready() {
  const message = { action: "ready", debug: store.debug };
  if (store.isWeb) {
    window.opener.postMessage(message, "*");
    window.addEventListener("message", messageHandler);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    who = params.get("name");
    tabId = Number(params.get("tabId"));
    browser.runtime.onMessage.addListener(messageHandler);
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      await resetSidePanel();
    }
  }
}

async function messageHandler(event: any) {
  if (event.data.action === "network") {
    network.value = event.data.network;
    if (store.debug)
      console.log("[Lute Debug]", {
        network: network.value,
      });
    await validateNetwork();
    loading.value = false;
  }
}

async function validateNetwork() {
  let errMsg: string | undefined;
  if (
    typeof network.value !== "object" ||
    Array.isArray(network.value) ||
    network.value === null ||
    !network.value.name ||
    network.value.algod?.port == null ||
    network.value.algod?.token == null ||
    !network.value.algod?.url ||
    (network.value.indexer &&
      (network.value.indexer?.port == null ||
        network.value.indexer?.token == null ||
        !network.value.indexer?.url)) ||
    !network.value.genesisID
  ) {
    errMsg = "Invalid Network";
  }
  const genIds = networks
    .map((n) => n.genesisID)
    .concat(store.customNetworks.map((n) => n.genesisID));
  if (genIds.includes(network.value.genesisID)) {
    errMsg = "Network Already Exists";
  }
  if (errMsg) {
    const message = {
      action: "error",
      code: 4300,
      message: errMsg,
      debug: store.debug,
    };
    sendOrPostMessage(message, tabId);
    window.close();
  }
}

async function addNetwork() {
  const newVal = deepClone(store.customNetworks.concat([network.value]));
  await set("app", "customNetworks", newVal);
  await set("app", "networkName", network.value.name);
  const message = {
    action: "added",
    debug: store.debug,
  };
  sendOrPostMessage(message, tabId);
  window.close();
}

window.onbeforeunload = () => {
  const message = { action: "close", debug: store.debug };
  sendOrPostMessage(message, tabId);
};
</script>
