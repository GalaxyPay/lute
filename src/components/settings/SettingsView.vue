<template>
  <div class="page settings" :class="narrow && 'settings--narrow'">
    <div class="settings-header">
      <span :class="narrow ? 'title-panel' : 'title-page'">Settings</span>
      <span v-if="xs || !store.isWeb" class="font-mono text-dim text-caption">
        v{{ appVersion }}
      </span>
    </div>

    <section>
      <div class="section-label">Network</div>
      <div :class="narrow ? 'd-flex flex-column ga-2' : 'group'">
        <div class="network-chips" :class="!narrow && 'hairline-bottom'">
          <v-btn
            v-for="item in algoNetworks"
            :key="item"
            :text="item"
            variant="outlined"
            size="small"
            class="net-btn"
            :active="store.networkName === item"
            @click="setNetwork(item)"
          />
          <span class="net-divider" />
          <v-btn
            v-for="item in altNetworks"
            :key="item"
            :text="item"
            variant="outlined"
            size="small"
            class="net-btn"
            :active="store.networkName === item"
            @click="setNetwork(item)"
          />
          <v-btn
            text="Custom"
            variant="outlined"
            size="small"
            class="net-btn net-btn--add"
            @click="showCustom = true"
          />
          <v-btn
            v-for="item in customNetworks"
            :key="item"
            :text="item"
            variant="outlined"
            size="small"
            class="net-btn"
            :active="store.networkName === item"
            @click="setNetwork(item)"
          />
        </div>
        <div
          class="set-row set-row--stack"
          :class="[
            narrow && 'group',
            store.networkName !== 'LocalNet' && 'set-row--off',
          ]"
        >
          <div class="set-title">Inbox router</div>
          <div class="set-desc">LocalNet only</div>
          <div class="set-actions">
            <v-btn
              size="small"
              text="Create new"
              @click="createRouter()"
              :disabled="store.networkName !== 'LocalNet'"
            />
            <span class="text-dim text-caption">or</span>
            <v-text-field
              v-model.number="store.network.inboxRouter"
              :key="store.loading"
              placeholder="Existing app ID"
              hide-details
              density="compact"
              class="router-field font-mono"
              :append-inner-icon="mdiContentSave"
              @click:append-inner="setRouter()"
              @keyup.enter="setRouter()"
              :disabled="store.networkName !== 'LocalNet'"
            />
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-label">Security</div>
      <div class="group">
        <div class="set-row">
          <div class="set-title">Wallet password</div>
          <div v-if="store.keystoreMode === 'password'" class="set-desc">
            Protects every account stored in this browser: HD, Algo25 and
            Falcon. Ledger and passkey accounts are not affected.
          </div>
          <div v-else class="set-desc text-warning">
            Not set. Accounts stored in this browser sign without a password,
            and anyone with access to this browser profile can use them and
            export their mnemonics.
          </div>
          <div class="set-actions">
            <template v-if="store.keystoreMode === 'password'">
              <v-btn
                text="Change"
                :variant="narrow ? 'text' : 'outlined'"
                size="small"
                @click="showRotate = true"
              />
              <v-btn
                v-if="store.hasKeystore"
                text="Remove"
                color="error"
                size="small"
                @click="showRemove = true"
              />
              <v-btn
                v-else
                text="Forgot"
                color="text-body"
                size="small"
                @click="forgotPassword()"
              />
            </template>
            <v-btn
              v-else
              text="Set password"
              :variant="narrow ? 'text' : 'outlined'"
              size="small"
              @click="showCreate = true"
            />
          </div>
        </div>
        <div
          v-if="!store.isWeb && store.keystoreMode === 'password'"
          class="set-row set-row--stack"
        >
          <div class="set-title">Lock after inactivity</div>
          <div class="set-desc">
            Skip the password when signing with any account stored in this
            browser, until the wallet has been idle this long. Always locks 8
            hours after initial unlock, regardless of activity.
          </div>
          <div class="set-actions">
            <v-select
              :model-value="store.autoLockMinutes"
              @update:model-value="setAutoLock"
              :items="autoLockOptions"
              item-title="title"
              item-value="value"
              density="compact"
              hide-details
              class="lock-select"
            />
            <v-btn
              text="Lock now"
              size="small"
              variant="flat"
              color="border"
              :disabled="!store.unlocked"
              @click="lockNow()"
            />
          </div>
        </div>
        <div class="set-row">
          <div class="set-title">Sync</div>
          <div class="set-desc">
            Copy this wallet's accounts and keys to the Lute
            {{ store.isWeb ? "extension" : "web app" }} in this browser. Your
            mnemonics are your backup; keep them safe.
          </div>
          <div class="set-actions">
            <v-btn
              v-if="!store.isWeb || canSyncToExtension"
              :text="store.isWeb ? 'Sync to extension' : 'Sync to web app'"
              :variant="narrow ? 'text' : 'outlined'"
              size="small"
              @click="startSync()"
            />
            <span v-else class="text-muted text-body-2">
              Install the Lute extension to sync
            </span>
          </div>
        </div>
        <div class="set-row">
          <div class="set-title">Manual Ledger select</div>
          <div class="set-desc">Always pick which Ledger device to connect</div>
          <div class="set-actions">
            <v-switch
              :model-value="store.ledgerSelect"
              :label="store.ledgerSelect ? 'Enabled' : 'Disabled'"
              hide-details
              @click.prevent="setLedgerSelect()"
            />
          </div>
        </div>
      </div>
    </section>

    <div class="settings-pair">
      <section>
        <div v-if="!narrow" class="section-label">Appearance</div>
        <div class="group">
          <div class="set-row">
            <div class="set-title">Theme</div>
            <div class="set-desc">Gold theme for Lutier holders only</div>
            <div class="set-actions">
              <v-radio-group
                :model-value="store.theme"
                @update:model-value="store.setTheme"
                inline
                hide-details
              >
                <v-radio
                  v-for="t in Object.keys(theme.themes.value)"
                  :key="t"
                  :label="t.charAt(0).toUpperCase() + t.slice(1)"
                  :value="t"
                  :disabled="t === 'gold' && !store.isLutier"
                />
              </v-radio-group>
            </div>
          </div>
          <div v-if="narrow" class="set-row">
            <div class="set-title">Snoop mode</div>
            <div class="set-desc">
              Allow connecting to dApps with Watch accounts
            </div>
            <div class="set-actions">
              <v-switch
                :model-value="store.snoop"
                :label="store.snoop ? 'Enabled' : 'Disabled'"
                hide-details
                @click.prevent="setSnoop()"
              />
            </div>
          </div>
          <div v-if="narrow" class="set-row">
            <div class="set-title">Debug logging</div>
            <div class="set-desc">Verbose logging to the console</div>
            <div class="set-actions">
              <v-switch
                :model-value="store.debug"
                :label="store.debug ? 'Enabled' : 'Disabled'"
                hide-details
                @click.prevent="setDebug()"
              />
            </div>
          </div>
        </div>
      </section>
      <section v-if="!narrow">
        <div class="section-label">dApps</div>
        <div class="group">
          <div class="set-row">
            <div class="set-title">Snoop mode</div>
            <div class="set-desc">
              Allow connecting to dApps with Watch accounts
            </div>
            <div class="set-actions">
              <v-switch
                :model-value="store.snoop"
                :label="store.snoop ? 'Enabled' : 'Disabled'"
                hide-details
                @click.prevent="setSnoop()"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <section v-if="!narrow">
      <div class="section-label">Developer</div>
      <div class="group">
        <div class="set-row">
          <div class="set-title">Debug logging</div>
          <div class="set-desc">Verbose logging to the console</div>
          <div class="set-actions">
            <v-switch
              :model-value="store.debug"
              :label="store.debug ? 'Enabled' : 'Disabled'"
              hide-details
              @click.prevent="setDebug()"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
  <CustomNetwork :visible="showCustom" @close="showCustom = false" />
  <PasswordRotate :visible="showRotate" @close="showRotate = false" />
  <PasswordRemove :visible="showRemove" @close="showRemove = false" />
  <keystore-unlock ref="unlocker" />
  <v-dialog v-model="showCreate" max-width="440" persistent>
    <password-create @close="showCreate = false" />
  </v-dialog>
  <v-dialog :model-value="!!sync" max-width="440" persistent>
    <sync-session
      v-if="sync"
      :side="store.isWeb ? 'web' : 'ext'"
      role="send"
      :mk="sync.mk"
      @close="sync = undefined"
    />
  </v-dialog>
</template>

<script lang="ts" setup>
import { Arc59Factory } from "@/clients/Arc59Client";
import { networks } from "@/data";
import { set } from "@/dbLute";
import Algo from "@/services/Algo";
import { extensionId } from "@/services/syncTransports";
import type { MasterKey, Unlocker } from "@/types";
import { isCancelled } from "@/utils";
import Unlock from "@/services/Unlock";
import { luteSigner } from "@/utils/signers";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { mdiContentSave } from "@mdi/js";
import { useDisplay, useTheme } from "vuetify";

const appVersion = __APP_VERSION__;
const { xs, width } = useDisplay();
// The extension side panel and phones stack each row.
const narrow = computed(() => width.value < 600);
const store = useAppStore();
const theme = useTheme();

const showCustom = ref(false);
const showRotate = ref(false);
const showRemove = ref(false);
const showCreate = ref(false);
const unlocker = ref<Unlocker>();
const sync = ref<{ mk: MasterKey }>();

/**
 * Unlock before the sync dialog opens. A prompt opened while that dialog is
 * still opening loses focus to it.
 */
async function startSync() {
  try {
    // Always the typed password: this hands over every key in the wallet.
    const mk = await unlocker.value!.ensureMk({ fresh: true });
    // Ask the extension for its side panel while this click (or password
    // submit) still counts as a user action; Chrome requires one.
    if (store.isWeb)
      window.dispatchEvent(
        new CustomEvent("lute-connect", { detail: { action: "sync" } })
      );
    sync.value = { mk };
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
const canSyncToExtension = ref(false);

onMounted(async () => {
  await Unlock.isUnlocked();
  if (!store.isWeb) return;
  canSyncToExtension.value = !!extensionId();
});

function forgotPassword() {
  if (
    !confirm(
      `This sets a new wallet password. Seeds protected by your old password stay locked until you enter that password when signing, or until you upgrade each account by re-entering its mnemonic.

Continue?`
    )
  )
    return;
  showCreate.value = true;
}

const autoLockOptions = [
  { title: "Off", value: 0 },
  { title: "5 minutes", value: 5 },
  { title: "15 minutes", value: 15 },
  { title: "30 minutes", value: 30 },
  { title: "60 minutes", value: 60 },
];

const altNetworks = networks
  .filter((n) => n.name.startsWith("Voi"))
  .map((n) => n.name);
const algoNetworks = networks
  .filter((n) => !altNetworks.some((v) => v === n.name))
  .map((n) => n.name);
const customNetworks = computed(() =>
  store.allNetworks
    .filter((an) => !networks.map((n) => n.genesisID).includes(an.genesisID))
    .map((an) => an.name)
);

async function setNetwork(name: string) {
  await set("app", "networkName", name);
  await store.getCache();
  store.refresh++;
}

async function setDebug() {
  await set("app", "debug", !store.debug);
  await store.getCache();
}

async function setSnoop() {
  await set("app", "snoop", !store.snoop);
  await store.getCache();
}

async function setLedgerSelect() {
  await set("app", "ledgerSelect", !store.ledgerSelect);
  await store.getCache();
}

async function setAutoLock(minutes: number) {
  await set("app", "autoLockMinutes", minutes);
  // Shortening or disabling the window must not leave a longer one running.
  await Unlock.clear();
  await store.getCache();
}

async function lockNow() {
  await Unlock.clear();
  store.setSnackbar("Wallet locked", "success", 2000);
}

async function createRouter() {
  try {
    const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
    algorand.setDefaultSigner(luteSigner);
    algorand.setDefaultValidityWindow(1000);
    // TODO: choose sender
    const factory = new Arc59Factory({
      defaultSender: store.acctInfo[0]?.addr,
      algorand,
    });
    const { result } = await factory.send.create.createApplication();
    store.network.inboxRouter = Number(result.appId);
    setRouter();
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}

async function setRouter() {
  store.loading++;
  await set("app", "sandboxRouter", store.network.inboxRouter);
  await store.getCache();
  store.setSnackbar("Router ID set", "success", 2000);
  store.loading--;
}
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 820px;
}
.settings-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.network-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 14px 16px;
}
.net-btn {
  --v-btn-height: 32px;
  padding-inline: 12px !important;
  border-radius: 7px;
  font-weight: 400;
}
.net-btn--add {
  border-style: dashed;
  color: rgb(var(--v-theme-text-muted)) !important;
}
.net-divider {
  align-self: stretch;
  width: 1px;
  margin: 0 4px;
  background: rgb(var(--v-theme-border-strong));
}
.set-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title actions"
    "desc actions";
  align-items: center;
  column-gap: 16px;
  padding: 14px 16px;
}
.group > .set-row + .set-row {
  border-top: 1px solid rgb(var(--v-theme-border));
}
.set-row--off {
  opacity: 0.5;
}
.set-title {
  grid-area: title;
  font-size: 14px;
}
.set-desc {
  grid-area: desc;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: rgb(var(--v-theme-text-dim));
}
.set-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.set-actions :deep(.v-switch) {
  flex: none;
}
.set-actions :deep(.v-selection-control-group) {
  gap: 14px;
}
.set-actions :deep(.v-radio) {
  --v-selection-control-size: 26px;
}
.set-actions :deep(.v-radio .v-label) {
  font-size: 13px;
  padding-inline-start: 4px;
}
.router-field {
  width: 200px;
  flex: none;
}
.lock-select {
  width: 150px;
  flex: none;
}
.settings-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

/* Extension side panel and phones */
.settings--narrow {
  gap: 14px;
  padding: 16px 12px;
}
.settings--narrow .section-label {
  font-size: 10.5px;
  margin-bottom: 6px;
  padding: 0 4px;
}
.settings--narrow .network-chips {
  gap: 5px;
  padding: 0;
}
.settings--narrow .net-btn {
  --v-btn-height: 28px;
  --v-btn-size: 12px;
  padding-inline: 9px !important;
  border-radius: 6px;
}
.settings--narrow .net-divider {
  display: none;
}
.settings--narrow .settings-pair {
  grid-template-columns: 1fr;
}
.settings--narrow .set-row {
  grid-template-areas:
    "title actions"
    "desc desc";
  padding: 11px 13px;
  row-gap: 4px;
}
.settings--narrow .set-row--stack {
  grid-template-columns: 1fr;
  grid-template-areas:
    "title"
    "desc"
    "actions";
  row-gap: 8px;
}
.settings--narrow .set-row--stack .set-actions .router-field {
  flex: 1;
  width: auto;
}
.settings--narrow .set-title {
  font-size: 13.5px;
}
.settings--narrow .set-desc {
  font-size: 11.5px;
}
</style>
