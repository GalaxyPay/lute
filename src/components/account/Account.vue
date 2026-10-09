<template>
  <div v-if="acct?.info" class="page detail-page" :class="xs && 'page--flush'">
    <div class="stat-grid" :style="{ '--chars': amountChars }">
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
      <v-card class="stat-card">
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
      </v-card>
      <v-card class="stat-card">
        <div class="stat-label">
          Min balance
          <span class="d-inline-flex">
            <v-icon size="14" class="text-icon" :icon="mdiInformationOutline" />
            <v-tooltip activator="parent" location="top" :text="MBR_TIP" />
          </span>
        </div>
        <div class="stat-value text-text-body">
          <span v-if="store.isVoi" class="font-weight-bold">V </span>
          <algo-icon
            v-else
            color="currentColor"
            :width="xs ? 13 : 18"
            class="algo-glyph"
          />
          {{ minBalance }}
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
          <assets :acct="acct" />
        </v-window-item>
        <v-window-item v-if="acct" :value="TXNS">
          <txn-table :acct="acct" />
        </v-window-item>
        <v-window-item v-if="acct" :value="SEND">
          <send :acct="acct" />
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
    <v-card v-if="acct.xpub" class="hd-card">
      <div class="card-header">HD addresses</div>
      <h-d-address-table :acct="acct" />
    </v-card>
  </div>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
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
// Both amounts share one size; Voi's "V" prefix takes a character too.
const amountChars = computed(
  () =>
    Math.max(balance.value.length, minBalance.value.length) +
    (store.isVoi ? 1 : 0)
);
const showRekeyTip = ref(false);
const showNsTip = ref(false);
const tab = ref(MSIG);
const tabs = computed(() => {
  const val = [];
  if (acct.value?.appId) val.push(MSIG);
  val.push(ASSETS, TXNS);
  if (acct.value?.canSign || acct.value?.appId) {
    val.push(SEND);
    if (acct.value?.ns?.appID) val.push(VAULT);
    if (inboxInfo.value?.assets?.length) val.push(INBOX);
  }
  return val;
});

const inboxInfo = ref<modelsv2.Account>();

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
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 18px;
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
.card-header {
  padding: 12px 18px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}
@media (max-width: 1279.98px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stat-card--address {
    grid-column: 1 / -1;
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
.page--flush .tabs-card,
.page--flush .hd-card {
  border: none;
  border-radius: 0;
  background: transparent;
  margin-bottom: 0;
}
.page--flush .hd-card {
  border-top: 1px solid rgb(var(--v-theme-border));
  margin-top: 12px;
}
</style>
