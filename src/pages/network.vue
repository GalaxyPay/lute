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
              <pre>{{ network }}</pre>
            </v-col>
          </v-row>
          <v-row class="text-center">
            <v-col>
              <v-btn
                variant="flat"
                size="large"
                text="Add"
                :disabled="!valid"
                @click="addNetwork()"
              />
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
  isFromOpener,
  postReady,
  resetSidePanel,
  sendOrPostMessage,
  whenLoaded,
} from "@/utils";
import { networkError } from "@/utils/networks";

const store = useAppStore();
const loading = ref(true);
const network = ref();
const valid = ref(false);

let tabId: number | undefined;
let who: string | null;

const siteName = computed(() => {
  return store.isWeb ? window.name : who;
});

onMounted(() => whenLoaded(ready));

async function ready() {
  const message = { action: "ready", debug: store.debug };
  if (store.isWeb) {
    window.addEventListener("message", messageHandler);
    postReady(message);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    who = params.get("name");
    tabId = Number(params.get("tabId"));
    browser.runtime.onMessage.addListener(messageHandler);
    try {
      await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch {
      await resetSidePanel();
    }
  }
}

async function messageHandler(event: any) {
  if (store.isWeb && !isFromOpener(event)) return;
  if (event.data?.action === "network") {
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
  const errMsg = networkError(network.value, [
    ...networks,
    ...store.customNetworks,
  ]);
  valid.value = !errMsg;
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
  // The request was already refused if this is false.
  if (!valid.value) return;
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
