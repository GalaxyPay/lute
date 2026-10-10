<template>
  <div
    class="page accounts-page"
    :class="!smAndUp && ['page--flush', store.isWeb ? 'touch' : 'panel']"
  >
    <div
      v-if="!store.acctInfo.length && !store.loading"
      class="empty-state text-center"
    >
      <div class="title-page">Accounts</div>
      <p class="text-muted">
        Lute is an Algorand (AVM) wallet. To get started, add an account to your
        wallet. Rekeyed accounts will import automatically as sub-accounts under
        the address they are rekeyed to.
      </p>
      <v-btn variant="flat" text="Add an account" @click="addAccount()" />
    </div>
    <template v-else>
      <div class="page-header">
        <div :class="smAndUp || store.isWeb ? 'title-page' : 'title-panel'">
          Accounts
        </div>
        <div v-if="smAndUp" class="d-flex ga-2">
          <v-btn
            v-show="store.acctInfo.length"
            variant="outlined"
            text="Refresh"
            :disabled="!!store.loading"
            @click="store.refresh++"
          />
          <v-btn variant="flat" text="Add an account" @click="addAccount()" />
        </div>
        <div v-else class="d-flex ga-2">
          <v-btn
            v-show="store.acctInfo.length"
            variant="outlined"
            :icon="mdiRefresh"
            class="square-btn"
            aria-label="Refresh"
            :disabled="!!store.loading"
            @click="store.refresh++"
          />
          <v-btn
            variant="flat"
            :icon="mdiPlus"
            class="square-btn"
            aria-label="Add an account"
            @click="addAccount()"
          />
        </div>
      </div>
      <div v-if="upgradeCount || noPassword" class="page-alerts">
        <v-alert v-if="upgradeCount" type="info" closable>
          {{ upgradeCount }} account{{ upgradeCount > 1 ? "s were" : " was" }}
          added before Lute could show mnemonics. To make
          {{ upgradeCount > 1 ? "them" : "it" }} exportable, choose
          <b>Upgrade account</b> from the account menu and re-enter the
          mnemonic.
        </v-alert>
        <v-alert v-if="noPassword" type="warning" closable>
          This wallet has no password. Anyone with access to this browser
          profile can sign with its accounts. Set one in Settings.
        </v-alert>
      </div>
      <v-data-table
        :loading="!!store.loading"
        :headers="headers"
        :items="store.acctInfo"
        class="no-select accounts-table"
        items-per-page="-1"
        @click:row="acctDetails"
        hover
      >
        <template #headers />
        <template #bottom />
        <!-- Only before the first load: a loading slot replaces existing rows. -->
        <template v-if="!store.acctInfo.length" #loading>
          <v-skeleton-loader type="table-row@3" />
        </template>
        <template #[`item.addr`]="{ item }">
          <div class="acct-cell" :class="item.subType && 'acct-cell--sub'">
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
            <div v-else class="acct-name">
              <span v-if="item.subType" class="text-icon">↳</span>
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
              <expire-chip :ns="item.ns" />
            </div>
            <div
              v-if="!mdAndUp || item.name || item.ns?.name"
              class="acct-sub ellipsis"
            >
              <template v-if="!mdAndUp">
                <account-icon :item plain />
                <template v-if="item.name || item.ns?.name">
                  · {{ item.title }}
                </template>
              </template>
              <template v-else>{{ item.title }}</template>
            </div>
          </div>
        </template>
        <template #[`item.type`]="{ item }">
          <account-icon :item />
        </template>
        <template #[`item.info.amount`]="{ value }">
          <span class="amount">
            <span v-if="store.isVoi" class="font-weight-bold">V </span>
            <algo-icon
              v-else
              color="currentColor"
              :width="10"
              class="algo-glyph"
            />
            {{ value != null ? bigintToString(value, 6, false, 2) : "-" }}
          </span>
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="d-flex justify-end">
            <v-btn
              v-show="smAndUp"
              size="small"
              icon
              variant="text"
              :aria-label="'Copy address'"
              @click.stop="copyToClipboard(item.addr)"
            >
              <v-icon :icon="mdiContentCopy" size="16" />
              <v-tooltip
                activator="parent"
                location="bottom"
                text="Copy address"
              />
            </v-btn>
            <v-btn
              :size="smAndUp ? 'small' : store.isWeb ? 'large' : 'small'"
              icon
              variant="text"
              aria-label="Account menu"
            >
              <v-icon :icon="mdiDotsHorizontal" size="20" />
              <v-menu activator="parent" location="bottom end">
                <v-list
                  density="compact"
                  class="row-menu"
                  :class="!smAndUp && store.isWeb && 'row-menu--touch'"
                >
                  <v-list-item
                    v-show="!smAndUp"
                    title="Copy address"
                    @click="copyToClipboard(item.addr)"
                  />
                  <v-list-item
                    title="Details"
                    :append-icon="mdiArrowTopRight"
                    :href="store.network.explorer + '/account/' + item.addr"
                    target="_blank"
                  />
                  <template v-if="!item.subType">
                    <v-list-item
                      title="Nickname"
                      @click="
                        rename = store.accounts.find(
                          (a) => a.addr === item.addr
                        )
                      "
                    />
                    <v-list-item
                      v-if="store.accounts.length > 1"
                      title="Move"
                      :append-icon="mdiChevronRight"
                      class="pointer"
                    >
                      <v-menu activator="parent" location="start" scrim>
                        <v-list density="compact" class="row-menu">
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
                      title="Set network"
                      class="pointer"
                    >
                      <template #append>
                        <span class="text-dim text-caption">
                          {{ item.network || "All" }}
                        </span>
                        <v-icon :icon="mdiChevronRight" size="18" />
                      </template>
                      <v-menu activator="parent" location="start" scrim>
                        <v-list density="compact" class="row-menu">
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
                    <v-divider
                      v-if="
                        item.secret === 'keystore' ||
                        item.secret === 'passkey' ||
                        isUpgradeable(item.secret)
                      "
                      class="my-1"
                    />
                    <v-list-item
                      v-if="
                        item.secret === 'keystore' || item.secret === 'passkey'
                      "
                      title="Export mnemonic"
                      @click="exportAcct = item"
                    />
                    <v-list-item
                      v-if="isUpgradeable(item.secret)"
                      title="Upgrade account"
                      base-color="info"
                      @click="upgradeAcct = item"
                    />
                    <v-divider class="my-1" />
                  </template>
                  <v-list-item
                    v-if="!item.subType"
                    title="Remove account"
                    base-color="error"
                    @click="removeAccount(item.addr)"
                  />
                </v-list>
              </v-menu>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </template>
  </div>
  <add-account-dialog :visible="showAdd" @close="showAdd = false" />
  <export-mnemonic :account="exportAcct" @close="exportAcct = undefined" />
  <upgrade-account :account="upgradeAcct" @close="upgradeAcct = undefined" />
</template>

<script lang="ts" setup>
import { networks } from "@/data";
import { keystoreTx, set } from "@/dbLute";
import router from "@/router";
import { isHd, isLocalSecret, isUpgradeable } from "@/services/accountSecret";
import type { AccountInfo, LuteAccount } from "@/types";
import { bigintToString, copyToClipboard, deepClone } from "@/utils";
import {
  mdiArrowDownThin,
  mdiArrowTopRight,
  mdiArrowUpThin,
  mdiCheck,
  mdiChevronRight,
  mdiContentCopy,
  mdiContentSave,
  mdiDotsHorizontal,
  mdiFormatVerticalAlignBottom,
  mdiFormatVerticalAlignTop,
  mdiPlus,
  mdiRefresh,
} from "@mdi/js";
import { useDisplay } from "vuetify";

const { smAndUp, mdAndUp } = useDisplay();
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
// Below md the type tag moves under the name, leaving the name room to show.
const headers = computed(() => {
  const val: any[] = [{ key: "addr" }];
  if (mdAndUp.value)
    val.push({ key: "type", width: 110, cellProps: { class: "col-type" } });
  val.push(
    {
      key: "info.amount",
      align: "end",
      width: smAndUp.value ? 150 : 1,
      cellProps: { class: "col-amount" },
    },
    { key: "actions", align: "end", width: smAndUp.value ? 88 : 1 }
  );
  return val;
});

const networkNames = ["All"].concat(networks.map((n) => n.name));

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
  store.setSnackbar("Account network set", "success");
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.page-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  max-width: 460px;
  margin: 12vh auto 0;
  padding: 0 20px;
  line-height: 1.6;
}
/* The name column takes the free width, so long names truncate. */
.accounts-table :deep(td:first-child) {
  width: 100%;
  max-width: 0;
}
.accounts-table :deep(td:not(:first-child)) {
  white-space: nowrap;
}
.accounts-page:not(.page--flush) .accounts-table :deep(.col-type) {
  width: 110px;
  min-width: 110px;
}
.accounts-page:not(.page--flush) .accounts-table :deep(.col-amount) {
  width: 150px;
  min-width: 150px;
}
.accounts-table :deep(td) {
  padding: 0 14px !important;
}
.accounts-table :deep(td:last-child) {
  padding-inline: 0 6px !important;
}
.acct-cell {
  min-width: 0;
  padding-block: 6px;
}
.acct-cell--sub {
  padding-left: 20px;
}
.acct-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
}
.acct-sub {
  margin-top: 2px;
  font: 12px/1.3 var(--font-mono);
  color: rgb(var(--v-theme-text-dim));
}
.square-btn {
  width: 34px !important;
  height: 34px !important;
  border-radius: 8px !important;
}
.page--flush .page-header {
  padding: 6px 16px 14px;
  margin: 0;
}
.page--flush .page-alerts {
  margin: 0 12px 8px;
}
.page--flush .accounts-table {
  border-top: 1px solid rgb(var(--v-theme-border));
}
.page--flush .accounts-table :deep(td) {
  padding: 0 4px 0 16px !important;
}
.page--flush .accounts-table :deep(td:last-child) {
  padding: 0 6px 0 0 !important;
}
.panel :deep(tbody tr) {
  height: 52px;
}
.panel .acct-name {
  font-size: 13.5px;
}
.panel .acct-sub {
  font-size: 11px;
}
.panel .amount {
  font-size: 13px;
}
.touch :deep(tbody tr) {
  height: 58px;
}
.touch .acct-name {
  font-size: 14.5px;
}
.touch .acct-sub {
  font-size: 11.5px;
}
.touch .square-btn {
  width: 40px !important;
  height: 40px !important;
}
.v-theme--light .accounts-page:not(.page--flush) .accounts-table {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: 10px;
  overflow: hidden;
}
.row-menu :deep(.v-list-item) {
  min-height: 34px;
}
.row-menu--touch :deep(.v-list-item) {
  min-height: 44px;
}
.row-menu--touch :deep(.v-list-item-title) {
  font-size: 14px;
}
</style>
