<template>
  <div class="ext-page">
    <template v-if="!store.accounts.length">
      <div class="ext-header">
        <div class="title-panel">Set up your wallet</div>
      </div>
      <div class="ext-body text-text-body">
        Your wallet is not set up. Visit Lute to get started.
      </div>
      <div class="ext-footer">
        <v-btn
          block
          size="large"
          variant="flat"
          text="Lute home"
          @click="home()"
        />
      </div>
    </template>
    <template v-else>
      <div class="ext-header">
        <div class="title-panel">Connect to {{ siteName }}</div>
      </div>
      <v-data-table
        v-model="selected"
        item-value="addr"
        :loading="!!store.loading"
        :items="store.snoop ? store.acctInfo : store.sendAcctInfo"
        :headers="headers"
        items-per-page="-1"
        show-select
        class="connect-table"
      >
        <template #headers />
        <template #bottom />
        <template #[`item.addr`]="{ item }">
          <div class="connect-name">
            <span class="ellipsis">
              {{ item.name || item.ns?.name || item.title }}
            </span>
            <span
              v-if="isUpgradeable(item.secret) && !item.subType"
              class="dot"
            >
              <v-tooltip
                activator="parent"
                location="top"
                text="Upgrade account from the menu"
              />
            </span>
          </div>
          <div class="connect-sub ellipsis">
            <account-icon :item plain />
            <template v-if="item.name || item.ns?.name">
              · {{ item.title }}
            </template>
          </div>
        </template>
        <template #[`item.info.amount`]="{ value }">
          <span class="amount">
            <span v-if="store.isVoi" class="font-weight-bold">V </span>
            <algo-icon
              v-else
              color="currentColor"
              :width="9"
              class="algo-glyph"
            />
            {{ value != null ? bigintToString(value, 6, false, 2) : "-" }}
          </span>
        </template>
      </v-data-table>
      <div class="ext-footer">
        <v-btn
          block
          size="large"
          variant="flat"
          text="Connect"
          :disabled="!selected.length"
          :loading="connecting"
          @click="connect()"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import router from "@/router";
import { isUpgradeable } from "@/services/accountSecret";
import Msig from "@/services/Msig";
import {
  bigintToString,
  isFromOpener,
  postReady,
  resetSidePanel,
  sendOrPostMessage,
  whenLoaded,
} from "@/utils";
import { emptySignatures } from "@/utils/emptySignature";
import { findNetwork } from "@/utils/networks";
const store = useAppStore();
const selected = ref([]);
const headers: any[] = [{ key: "addr" }, { key: "info.amount", align: "end" }];
const who = ref();
let genesisID: string | null;
let tabId: number | undefined;

onMounted(() => whenLoaded(ready));

async function ready() {
  if (store.isWeb) {
    window.addEventListener("message", messageHandler);
    postReady({ action: "ready", debug: store.debug });
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
    if (store.isWeb && !isFromOpener(event)) return;
    if (event.data?.action === "network") {
      const network = findNetwork(store.allNetworks, event.data.genesisID);
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

const connecting = ref(false);

async function connect() {
  connecting.value = true;
  const addrs: string[] = [...selected.value];
  // For dapps that simulate fees. Best effort: never blocks connecting.
  let sigs: Record<string, string> = {};
  try {
    sigs = await emptySignatures(addrs, store.acctInfo, (appId) =>
      Msig.loadParams(appId)
    );
  } catch (err) {
    console.error(err);
  }
  const message = {
    action: "connect",
    addrs,
    emptySignatures: sigs,
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

<style scoped>
.connect-table :deep(td) {
  padding: 8px 10px !important;
  border-bottom: none !important;
}
.connect-table :deep(td:nth-child(2)) {
  width: 100%;
  max-width: 0;
}
.connect-table :deep(td:last-child) {
  white-space: nowrap;
}
.connect-table {
  padding: 6px 8px;
}
.connect-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
}
.connect-sub {
  margin-top: 2px;
  font: 11px var(--font-mono);
  color: rgb(var(--v-theme-text-dim));
}
.amount {
  font-size: 13px;
}
</style>
