<template>
  <v-container class="pt-0">
    <v-card>
      <v-card-title class="d-flex">
        Accounts
        <v-spacer />
        <v-icon
          v-show="store.acctInfo.length"
          :disabled="!!store.loading"
          :icon="mdiRefresh"
          size="small"
          class="mt-1 mr-1"
          @click="store.refresh++"
        />
      </v-card-title>
      <v-card-text
        v-if="!store.acctInfo.length && !store.loading"
        class="pa-6 text-center"
      >
        Lute is an Algorand (AVM) wallet. To get started, add an account to your
        wallet.
        <div>
          Rekeyed accounts will import automatically as sub-accounts under the
          address they are rekeyed to.
        </div>
      </v-card-text>
      <v-container v-else>
        <v-data-table
          :loading="!!store.loading"
          loading-text="Loading Accounts..."
          :headers="headers"
          :items="store.acctInfo"
          class="no-select"
          items-per-page="-1"
          @click:row="acctDetails"
          hover
        >
          <template #headers />
          <template #bottom />
          <template #[`item.addr`]="{ item }">
            <v-row
              no-gutters
              align="center"
              class="flex-nowrap ml-1"
              :class="item.subType && (smAndUp ? 'ml-6' : 'ml-3')"
            >
              <v-col cols="auto" class="pr-1">
                <account-icon :item />
              </v-col>
              <v-col cols="auto">
                <div :class="xxs && 'truncate'">
                  <v-text-field
                    v-if="rename?.addr === item.addr"
                    v-model="rename.name"
                    variant="underlined"
                    density="compact"
                    hide-details
                    :append-inner-icon="mdiContentSave"
                    autofocus
                    @click:append-inner="renameAccount()"
                    @keyup.enter="renameAccount()"
                    @click.stop
                  />
                  <span v-else :class="expireClass(item.ns?.timeExpires)">
                    {{ item.name || item.ns?.name }}
                    <expire-chip v-if="!xxs" class="ml-1" :ns="item.ns" />
                  </span>
                </div>
                <span
                  :class="
                    rename?.addr === item.addr || item.name || item.ns?.name
                      ? 'text-grey'
                      : ''
                  "
                >
                  {{ xxs ? item.title.substring(9, 0) : item.title }}
                </span>
              </v-col>
            </v-row>
          </template>
          <template #[`item.info.assets`]="{ value }">
            {{ value != null ? value.length : "-" }}
            <div class="text-grey">Assets</div>
          </template>
          <template #[`item.info.amount`]="{ value }">
            <span class="text-no-wrap">
              <span v-if="store.isVoi" class="font-weight-bold">V</span>
              <algo-icon v-else color="currentColor" :width="10" />
              {{ value != null ? bigintToString(value, 6, false, 2) : "-" }}
            </span>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn
              v-show="smAndUp"
              size="small"
              icon
              variant="plain"
              color="currentColor"
              @click.stop="copyToClipboard(item.addr)"
            >
              <v-icon :icon="mdiContentCopy" />
              <v-tooltip
                activator="parent"
                location="bottom"
                text="Copy Address"
              />
            </v-btn>
            <v-btn size="small" icon variant="plain" color="currentColor">
              <v-icon :icon="mdiDotsHorizontal" size="x-large" />
              <account-menu
                :item
                @rename="
                  (addr) =>
                    (rename = store.accounts.find((a) => a.addr === addr))
                "
              />
            </v-btn>
          </template>
        </v-data-table>
      </v-container>
      <v-container class="text-center">
        <v-btn text="Add an Account" @click="addAccount()" />
      </v-container>
    </v-card>
  </v-container>
  <add-account-dialog :visible="showAdd" @close="showAdd = false" />
  <v-dialog v-model="showMnemonic" max-width="600" persistent>
    <v-card title="Seed Mnemonic:">
      <v-container>
        <v-row style="font-family: monospace">
          <v-col v-for="n in 24" :key="n" cols="6" sm="4" class="py-0">
            <v-text-field
              :model-value="mnemonicArray[n - 1]"
              variant="plain"
              readonly
              hide-details
              density="compact"
            >
              <template #prepend>{{ n < 10 ? "&nbsp;" + n : n }}.</template>
            </v-text-field>
          </v-col>
        </v-row>
      </v-container>
      <v-card-actions>
        <v-spacer />
        <v-btn text="Copy" @click="copyToClipboard(mnemonicArray.join(' '))" />
        <v-btn text="Close" @click="closeMnemonic()" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import router from "@/router";
import {
  bigintToString,
  copyToClipboard,
  deepClone,
  expireDays,
} from "@/utils";
import {
  mdiContentCopy,
  mdiContentSave,
  mdiDotsHorizontal,
  mdiRefresh,
} from "@mdi/js";
import { useDisplay } from "vuetify";

const { smAndUp, width } = useDisplay();
const xxs = computed(() => width.value < 450);
const store = useAppStore();
const showAdd = ref(false);
const rename = ref<any>({});
const headers = computed(() => {
  const val: any[] = [{ key: "addr" }];
  if (smAndUp.value) val.push({ key: "info.assets" });
  val.push(
    { key: "info.amount", align: "end" },
    { key: "actions", align: "end" }
  );
  return val;
});

function expireClass(timeExpires: string | undefined) {
  if (!xxs.value) return;
  const expDays = expireDays(timeExpires);
  if (expDays == null) return;
  if (expDays <= 1) return "text-red";
  if (expDays <= 30) return "text-warning";
}

async function addAccount() {
  if (store.isWeb) showAdd.value = true;
  else {
    browser.runtime.sendMessage("addAccount").catch(() => {
      browser.runtime.onMessage.addListener(listener);
      async function listener(message: any) {
        if (message === "optionsReady") {
          browser.runtime.sendMessage("addAccount");
          browser.runtime.onMessage.removeListener(listener);
        }
      }
    });
    browser.runtime.openOptionsPage();
  }
}

async function renameAccount() {
  const ix = store.accounts.findIndex((a) => a.addr === rename.value.addr);
  if (ix !== -1) {
    const accts = deepClone(store.accounts);
    accts[ix].name = rename.value.name;
    await set("app", "accounts", accts);
    await store.getCache();
  }
  rename.value = undefined;
}

function acctDetails(_event: any, row: any) {
  router.push(row.item.addr);
}

const showMnemonic = ref(false);
const mnemonicArray = ref<string[]>([]);

function closeMnemonic() {
  showMnemonic.value = false;
  mnemonicArray.value = [];
}
</script>

<style>
.v-table > .v-table__wrapper > table > tbody > tr > td {
  padding: 0 4px;
}
</style>
