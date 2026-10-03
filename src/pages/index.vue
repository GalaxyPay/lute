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
        <v-alert
          v-if="upgradeCount"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-2"
          closable
        >
          {{ upgradeCount }} account{{ upgradeCount > 1 ? "s were" : " was" }}
          added before Lute could show mnemonics. To make
          {{ upgradeCount > 1 ? "them" : "it" }} exportable, choose Upgrade
          Account from the account menu and re-enter the mnemonic.
        </v-alert>
        <v-alert
          v-if="noPassword"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
          closable
        >
          This wallet has no password. Anyone with access to this browser
          profile can sign with its accounts. Set one in Settings.
        </v-alert>
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
                    <v-chip
                      v-if="!item.subType && isUpgradeable(item.secret)"
                      text="Legacy"
                      size="x-small"
                      class="ml-1"
                    />
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
              <v-menu activator="parent" bottom>
                <v-list density="compact">
                  <v-list-item
                    v-show="!smAndUp"
                    title="Copy Address"
                    :prepend-icon="mdiContentCopy"
                    @click="copyToClipboard(item.addr)"
                  />
                  <v-list-item
                    title="Details"
                    :prepend-icon="mdiInformationOutline"
                    :href="store.network.explorer + '/account/' + item.addr"
                    target="_blank"
                  />
                  <template v-if="!item.subType">
                    <v-list-item
                      title="Nickname"
                      :prepend-icon="mdiPencil"
                      @click="
                        rename = store.accounts.find(
                          (a) => a.addr === item.addr
                        )
                      "
                    />
                    <v-list-item
                      v-if="store.accounts.length > 1"
                      title="Move"
                      :append-icon="mdiMenuDown"
                      :prepend-icon="mdiCursorMove"
                      class="pointer"
                    >
                      <v-menu activator="parent" bottom scrim>
                        <v-list density="compact">
                          <v-list-item
                            v-for="action in moveActions"
                            :key="action.name"
                            :title="action.name"
                            :prepend-icon="action.icon"
                            :disabled="action.disabled(item.addr)"
                            @click="moveAcct(item.addr, action.name)"
                          />
                        </v-list>
                      </v-menu>
                    </v-list-item>
                    <v-list-item
                      v-if="!item.appId"
                      title="Set Network"
                      :prepend-icon="mdiSourceBranch"
                      :append-icon="mdiMenuDown"
                      class="pointer"
                    >
                      <v-menu activator="parent" bottom scrim>
                        <v-list density="compact">
                          <v-list-item
                            v-for="network in networkNames"
                            :key="network"
                            :title="network"
                            :append-icon="
                              (!item.network && network === 'All') ||
                              item.network === network
                                ? mdiCheck
                                : ''
                            "
                            @click="setAcctNetwork(item, network)"
                          />
                        </v-list>
                      </v-menu>
                    </v-list-item>
                    <v-list-item
                      v-if="
                        item.secret === 'keystore' || item.secret === 'passkey'
                      "
                      title="Export Mnemonic"
                      :prepend-icon="mdiFormatListNumbered"
                      @click="exportAcct = item"
                    />
                    <v-list-item
                      v-if="isUpgradeable(item.secret)"
                      title="Upgrade Account"
                      :prepend-icon="mdiArrowUpBoldCircleOutline"
                      @click="upgradeAcct = item"
                    />
                  </template>
                  <v-list-item
                    v-if="!item.subType"
                    title="Remove Account"
                    :prepend-icon="mdiDelete"
                    base-color="error"
                    @click="removeAccount(item.addr)"
                  />
                </v-list>
              </v-menu>
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
  <export-mnemonic :account="exportAcct" @close="exportAcct = undefined" />
  <upgrade-account :account="upgradeAcct" @close="upgradeAcct = undefined" />
</template>

<script lang="ts" setup>
import { networks } from "@/data";
import { keystoreTx, set } from "@/dbLute";
import router from "@/router";
import {
  isHd,
  isLocalSecret,
  isUpgradeable,
} from "@/services/accountSecret";
import type { AccountInfo, LuteAccount } from "@/types";
import {
  bigintToString,
  copyToClipboard,
  deepClone,
  expireDays,
} from "@/utils";
import {
  mdiArrowDownThin,
  mdiArrowUpBoldCircleOutline,
  mdiArrowUpThin,
  mdiCheck,
  mdiContentCopy,
  mdiContentSave,
  mdiCursorMove,
  mdiDelete,
  mdiDotsHorizontal,
  mdiFormatListNumbered,
  mdiFormatVerticalAlignBottom,
  mdiFormatVerticalAlignTop,
  mdiInformationOutline,
  mdiMenuDown,
  mdiPencil,
  mdiRefresh,
  mdiSourceBranch,
} from "@mdi/js";
import { useDisplay } from "vuetify";

const { smAndUp, width } = useDisplay();
const xxs = computed(() => width.value < 450);
const store = useAppStore();
const showAdd = ref(false);
const rename = ref<any>({});
const exportAcct = ref<AccountInfo>();
const upgradeAcct = ref<AccountInfo>();

const upgradeCount = computed(
  () =>
    store.acctInfo.filter((a) => !a.subType && isUpgradeable(a.secret)).length
);
const noPassword = computed(
  () =>
    store.keystoreMode === "device" &&
    store.acctInfo.some((a) => !a.subType && isLocalSecret(a.secret))
);
const headers = computed(() => {
  const val: any[] = [{ key: "addr" }];
  if (smAndUp.value) val.push({ key: "info.assets" });
  val.push(
    { key: "info.amount", align: "end" },
    { key: "actions", align: "end" }
  );
  return val;
});

const networkNames = ["All"].concat(networks.map((n) => n.name));

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

async function removeAccount(addr: string) {
  const acct = store.acctInfo.find((a) => a.addr === addr && !a.subType);
  const local = !!acct && isLocalSecret(acct.secret);
  const hd = !!acct && isHd(acct);
  const notes = [
    "If you remove this account it will still exist on the blockchain but you will not be able to access it in Lute.",
  ];
  if (local && !hd)
    notes.push(
      "Its key is deleted from this browser. Make sure you have its mnemonic."
    );
  if (hd)
    notes.push(
      "The HD seed stays in this browser, so the account can be added back from it."
    );
  notes.push("Are you sure you want to continue?");
  if (!confirm(notes.join("\n\n"))) return;
  // One transaction, reading the account list from the database rather than
  // this page's cache, so a concurrent change in another window is kept.
  await keystoreTx(async (tx) => {
    const app = tx.objectStore("app");
    const current: LuteAccount[] = (await app.get("accounts")) ?? [];
    app.put(
      current.filter((a) => a.addr !== addr),
      "accounts"
    );
    tx.objectStore("keys").delete(addr);
    tx.objectStore("falcon25-seeds").delete(addr);
    tx.objectStore("keystore").delete(`algo25:${addr}`);
    tx.objectStore("keystore").delete(`falcon25:${addr}`);
  });
  await store.getCache();
  store.refresh++;
}

function acctDetails(_event: any, row: any) {
  router.push(row.item.addr);
}

function disableUp(addr: string) {
  return store.acctInfo.findIndex((a) => a.addr === addr) === 0;
}

function disableDown(addr: string) {
  return (
    store.accounts.findIndex((a) => a.addr === addr) ===
      store.accounts.length - 1 ||
    store.acctInfo.findIndex((a) => a.addr === addr) ===
      store.acctInfo.length - 1
  );
}

const moveActions = [
  {
    name: "Top",
    icon: mdiFormatVerticalAlignTop,
    disabled: (addr: string) => disableUp(addr),
  },
  {
    name: "Up",
    icon: mdiArrowUpThin,
    disabled: (addr: string) => disableUp(addr),
  },
  {
    name: "Down",
    icon: mdiArrowDownThin,
    disabled: (addr: string) => disableDown(addr),
  },
  {
    name: "Bottom",
    icon: mdiFormatVerticalAlignBottom,
    disabled: (addr: string) => disableDown(addr),
  },
];

async function moveAcct(addr: string, action: string) {
  const idx = store.accounts.findIndex((a) => a.addr === addr);
  if (idx === -1) throw Error("Invalid Account");
  const newVal = deepClone(store.accounts);
  const acct = newVal.splice(idx, 1)[0];
  let localIdx: number;
  let shift: number;
  switch (action) {
    case "Top":
      newVal.unshift(acct);
      break;
    case "Up":
      localIdx = store.acctInfo.findIndex((a) => a.addr === addr);
      shift = idx - store.acctInfo[localIdx - 1]!.globalIdx;
      newVal.splice(idx - shift, 0, acct);
      break;
    case "Down":
      localIdx = store.acctInfo.findIndex((a) => a.addr === addr);
      shift =
        store.acctInfo.filter((a) => !a.info?.authAddr)[localIdx + 1]!
          .globalIdx - idx;
      newVal.splice(idx + shift, 0, acct);
      break;
    case "Bottom":
      newVal.push(acct);
      break;
  }
  await set("app", "accounts", newVal);
  await store.getCache();
}

async function setAcctNetwork(acct: LuteAccount, network: string) {
  const accts: LuteAccount[] = deepClone(store.accounts);
  const idx = accts.findIndex((a) => a.addr === acct.addr);
  if (idx === -1) throw Error("Account Not Found");
  accts[idx]!.network = network === "All" ? undefined : network;
  await set("app", "accounts", accts);
  await store.getCache();
  store.refresh++;
  store.setSnackbar("Account Network Set", "success");
}
</script>

<style>
.v-table > .v-table__wrapper > table > tbody > tr > td {
  padding: 0 4px;
}
</style>
