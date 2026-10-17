<template>
  <div
    v-if="acct?.info"
    class="page page--max detail-page"
    :class="xs && 'page--flush'"
  >
    <div
      class="stat-grid"
      :class="assetValue !== undefined && 'stat-grid--assets'"
      :style="{ '--chars': amountChars }"
    >
      <v-card class="stat-card stat-card--address">
        <div class="stat-label">
          Address
          <v-chip
            v-if="acct.info.authAddr"
            size="x-small"
            :prepend-icon="mdiKey"
            @click="showRekeyTip = !showRekeyTip"
          >
            Rekeyed
            <v-tooltip
              class="font-mono"
              activator="parent"
              v-model="showRekeyTip"
              :text="acct.info.authAddr.toString()"
            />
          </v-chip>
          <v-chip
            v-if="acct.ns?.name"
            size="x-small"
            @click="showNsTip = !showNsTip"
          >
            {{ store.isVoi ? "EnVoi" : "NFD" }}
            <v-tooltip
              activator="parent"
              v-model="showNsTip"
              :text="acct.ns.name"
            />
          </v-chip>
          <v-btn
            :icon="mdiRefresh"
            variant="text"
            :size="xs && store.isWeb ? 'large' : 'small'"
            class="ml-auto stat-refresh"
            aria-label="Refresh"
            :disabled="!!store.loading"
            @click="store.refresh++"
          />
        </div>
        <div class="stat-address">{{ acct.info.address }}</div>
        <div v-if="acct.info.addrIdx != null || acct.xpub" class="address">
          {{ `44'/283'/${acct.slot}'/0/${acct.info.addrIdx || 0}` }}
        </div>
      </v-card>
      <v-card class="stat-card stat-card--balance">
        <div class="stat-label">Balance</div>
        <div class="stat-value">
          <span v-if="store.isVoi" class="font-weight-bold">V </span>
          <algo-icon
            v-else
            color="currentColor"
            :width="xs ? 13 : 18"
            class="algo-glyph"
          />
          {{ balance }}
        </div>
        <span class="stat-sub">
          Min
          <span v-if="store.isVoi" class="font-weight-bold">V</span>
          <algo-icon
            v-else
            color="currentColor"
            :width="9"
            class="algo-glyph"
          />
          <span class="font-mono">{{ minBalance }}</span>
          <span class="d-inline-flex align-self-center">
            <v-icon size="13" class="text-icon" :icon="mdiInformationOutline" />
            <v-tooltip activator="parent" location="top" :text="MBR_TIP" />
          </span>
        </span>
      </v-card>
      <v-card v-if="assetValue !== undefined" class="stat-card">
        <div class="stat-label">Asset Value</div>
        <div class="stat-value">
          <algo-icon
            color="currentColor"
            :width="xs ? 13 : 18"
            class="algo-glyph"
          />
          {{ assetText }}
        </div>
      </v-card>
    </div>
    <v-card class="tabs-card">
      <v-tabs v-model="tab" class="detail-tabs" show-arrows>
        <v-tab
          v-for="t in tabs"
          :key="t"
          :text="t === TXNS && xs ? 'Txns' : t"
          :value="t"
        />
      </v-tabs>
      <v-window v-model="tab">
        <v-window-item v-if="acct.appId" :value="MSIG">
          <msig :appId="acct.appId" />
        </v-window-item>
        <v-window-item v-if="acct" :value="ASSETS">
          <assets :acct="acct" @swap="openSwap" />
        </v-window-item>
        <v-window-item v-if="acct" :value="TXNS">
          <txn-table :acct="acct" />
        </v-window-item>
        <v-window-item v-if="acct" :value="SEND">
          <send :acct="acct" />
        </v-window-item>
        <v-window-item v-if="acct && showSwap" :value="SWAP">
          <!-- Mounted only while shown, so it stops refreshing quotes and
          picks up `from` each time. -->
          <swap
            v-if="tab === SWAP"
            :acct="acct"
            :from="swapFrom"
            @complete="tab = ASSETS"
          />
        </v-window-item>
        <v-window-item v-if="acct.xpub" :value="HD">
          <h-d-address-table :acct="acct" />
        </v-window-item>
        <v-window-item v-if="acct" :value="VAULT">
          <vault :acct="acct" @complete="tab = ASSETS" />
        </v-window-item>
        <v-window-item v-if="acct && inboxInfo" :value="INBOX">
          <inbox
            :inbox-info="inboxInfo"
            :acct="acct"
            @complete="tab = ASSETS"
          />
        </v-window-item>
      </v-window>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import { algoValue, formatAlgoValue } from "@/services/Prices";
import { swapSupported } from "@/services/Swap";
import { bigintToString } from "@/utils";
import { mdiInformationOutline, mdiKey, mdiRefresh } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";
import { useDisplay } from "vuetify";

const ASSETS = "Assets";
const SEND = "Send";
const MSIG = "Multi-sig";
const TXNS = "Transactions";
const INBOX = "Inbox";
const VAULT = "Vault";
const HD = "HD";
const SWAP = "Swap";

const MBR_TIP = `Your MBR increases with each asset and/or application you opt into.
You can decrease your MBR by closing out of assets and applications.`;

const store = useAppStore();
const { xs } = useDisplay();
const props = defineProps({ addr: { type: String, required: true } });
const acct = computed(() => store.acctInfo.find((i) => i.addr === props.addr));
const balance = computed(() =>
  acct.value?.info?.amount != null
    ? bigintToString(acct.value.info.amount, 6)
    : "-"
);
const minBalance = computed(() =>
  acct.value?.info?.minBalance != null
    ? bigintToString(acct.value.info.minBalance, 6)
    : "-"
);
// Only from prices the Accounts overview has already loaded.
const assetValue = computed(() => {
  let total: number | undefined;
  for (const h of acct.value?.info?.assets ?? []) {
    const v = h.amount ? algoValue(h.assetId, h.amount) : undefined;
    if (v !== undefined) total = (total ?? 0) + v;
  }
  return total;
});
const assetText = computed(() =>
  assetValue.value === undefined ? "" : formatAlgoValue(assetValue.value)
);
// Both amounts share one size; Voi's "V" prefix takes a character too.
const amountChars = computed(
  () =>
    Math.max(balance.value.length, assetText.value.length) +
    (store.isVoi ? 1 : 0)
);
const showRekeyTip = ref(false);
const showNsTip = ref(false);
const tab = ref(MSIG);
const tabs = computed(() => {
  const val = [];
  if (acct.value?.appId) val.push(MSIG);
  val.push(ASSETS, TXNS);
  if (acct.value?.xpub) val.push(HD);
  if (acct.value?.canSign || acct.value?.appId) {
    val.push(SEND);
    if (showSwap.value) val.push(SWAP);
    if (acct.value?.ns?.appID) val.push(VAULT);
    if (inboxInfo.value?.assets?.length) val.push(INBOX);
  }
  return val;
});

const inboxInfo = ref<modelsv2.Account>();

// Msig accounts store txns for their members instead of signing, and a
// swap's quote expires long before that.
const showSwap = computed(
  () => !!acct.value?.canSign && !acct.value.appId && swapSupported()
);
const swapFrom = ref<bigint>();
function openSwap(assetId: bigint) {
  swapFrom.value = assetId;
  tab.value = SWAP;
}
// Opening the tab directly starts from ALGO, not the last asset card.
watch(tab, (t) => {
  if (t !== SWAP) swapFrom.value = undefined;
});

async function getInbox() {
  if (!store.network.inboxRouter) return;
  let inbox: string;
  inboxInfo.value = undefined;
  try {
    const boxName = algosdk.Address.fromString(props.addr).publicKey;
    const resp = await Algo.algod
      .getApplicationBoxByName(store.network.inboxRouter, boxName)
      .do();
    inbox = algosdk.encodeAddress(resp.value);
  } catch {
    return;
  }
  inboxInfo.value = await Algo.algod.accountInformation(inbox).do();
}

watch(
  () => store.refresh,
  () => {
    getInbox();
  },
  { immediate: true }
);
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.stat-grid--assets {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
}
.stat-card {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
}
.stat-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  font-size: 12px;
  color: rgb(var(--v-theme-text-muted));
}
.stat-refresh {
  margin: -8px -8px -8px auto;
}
.stat-address {
  font: 13px/1.5 var(--font-mono);
  color: rgb(var(--v-theme-on-surface));
  word-break: break-all;
}
.stat-sub {
  display: flex;
  align-items: center;
  gap: 0.35em;
  min-height: 20px;
  font-size: 12px;
  white-space: nowrap;
  color: rgb(var(--v-theme-text-dim));
}
/* Above xs, min balance rides on the label row so it adds no height; on xs
   it stays under the balance. */
.detail-page:not(.page--flush) .stat-card--balance {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "label sub" "value value";
  gap: 8px 6px;
}
.detail-page:not(.page--flush) .stat-card--balance .stat-label {
  grid-area: label;
}
.detail-page:not(.page--flush) .stat-card--balance .stat-sub {
  grid-area: sub;
}
.detail-page:not(.page--flush) .stat-card--balance .stat-value {
  grid-area: value;
}
/* Long amounts shrink to fit the card. Each mono character takes 0.6em
   (the -0.02em tracking leaves slack for rounding); the glyph and the 0.35em
   gap come off the width first. Past 12px the number wraps instead. */
.stat-value {
  --max: 26px;
  --glyph: 18px;
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  font: 500 var(--max) / 1.2 var(--font-mono);
  font-size: clamp(
    12px,
    (100cqi - var(--glyph)) / (var(--chars) * 0.6 + 0.35),
    var(--max)
  );
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.tabs-card {
  margin-bottom: 18px;
}
.detail-tabs {
  padding: 6px 8px 0;
}
@media (max-width: 1279.98px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .stat-card--address {
    grid-column: 1 / -1;
  }
  .stat-grid--assets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.page--flush .stat-grid {
  gap: 10px;
  padding: 0 14px;
  margin-bottom: 6px;
}
.page--flush .stat-card {
  padding: 12px 14px;
  gap: 4px;
}
.page--flush .stat-card--address {
  padding: 14px;
  gap: 6px;
}
.page--flush .stat-address {
  font-size: 12.5px;
}
.page--flush .stat-value {
  --max: 19px;
  --glyph: 13px;
}
.page--flush .tabs-card {
  border: none;
  border-radius: 0;
  background: transparent;
  margin-bottom: 0;
}
</style>
