<template>
  <div v-if="acct?.info">
    <v-container class="pt-0">
      <v-row>
        <v-col cols="12" class="pb-0">
          <v-card>
            <v-container class="pt-1 pb-0 pl-4 text-button">
              <v-row>
                <v-col>
                  Address
                  <v-chip
                    v-if="acct.info.authAddr"
                    class="mr-1"
                    size="x-small"
                    :prepend-icon="mdiKey"
                    @click="showRekeyTip = !showRekeyTip"
                  >
                    Rekeyed
                    <v-tooltip
                      activator="parent"
                      v-model="showRekeyTip"
                      :text="acct.info.authAddr.toString()"
                      style="font-family: monospace"
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
                </v-col>
                <v-col cols="2" class="text-right">
                  <v-icon
                    :disabled="!!store.loading"
                    :icon="mdiRefresh"
                    size="large"
                    class="mt-1 mr-1"
                    @click="store.refresh++"
                  />
                </v-col>
              </v-row>
            </v-container>
            <v-card-text class="pt-1 pb-3">
              <div style="font-family: monospace">{{ acct.info.address }}</div>
              <div
                v-if="acct.info.addrIdx != null || acct.xpub"
                class="text-grey text-caption"
              >
                {{ `44'/283'/${acct.slot}'/0/${acct.info.addrIdx || 0}` }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="12" sm="6" class="pb-0">
          <v-card>
            <v-container class="pt-1 pb-0 pl-4 text-button">
              Balance
            </v-container>
            <v-card-text class="pt-1 pb-3">
              <span v-if="store.isVoi" class="font-weight-bold">V</span>
              <algo-icon v-else color="currentColor" :width="13" class="mr-1" />
              {{
                acct.info.amount != null
                  ? bigintToString(acct.info.amount, 6)
                  : "-"
              }}
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6">
          <v-card>
            <v-container class="pt-1 pb-0 pl-4 text-button">
              Min Balance
              <span>
                <v-icon
                  size="small"
                  class="ml-1 mb-1"
                  :icon="mdiInformationOutline"
                />
                <v-tooltip activator="parent" location="top" :text="MBR_TIP" />
              </span>
            </v-container>
            <v-card-text class="pt-1 pb-3">
              <span v-if="store.isVoi" class="font-weight-bold">V </span>
              <algo-icon v-else color="currentColor" :width="13" class="mr-1" />
              {{
                acct.info.minBalance != null
                  ? bigintToString(acct.info.minBalance, 6)
                  : "-"
              }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
    <v-container class="pt-0">
      <v-card>
        <v-tabs v-model="tab" color="primary">
          <v-tab
            v-for="t in tabs"
            :key="t"
            :text="t === 'TRANSACTIONS' && xs ? 'TXNS' : t"
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
    </v-container>
    <v-container v-if="acct.xpub">
      <v-card>
        <v-container class="pt-1 pb-0 pl-4 text-button">
          HD Addresses
        </v-container>
        <h-d-address-table :acct="acct" />
      </v-card>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import { bigintToString } from "@/utils";
import { mdiInformationOutline, mdiKey, mdiRefresh } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";
import { useDisplay } from "vuetify";

const ASSETS = "ASSETS";
const SEND = "SEND";
const MSIG = "MULTI-SIG";
const TXNS = "TRANSACTIONS";
const INBOX = "INBOX";
const VAULT = "VAULT";

const MBR_TIP = `Your MBR increases with each asset and/or application you opt into.
You can decrease your MBR by closing out of assets and applications.`;

const store = useAppStore();
const { xs } = useDisplay();
const props = defineProps({ addr: { type: String, required: true } });
const acct = computed(() => store.acctInfo.find((i) => i.addr === props.addr));
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
