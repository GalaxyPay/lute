<template>
  <v-container class="pt-0">
    <v-card
      title="Settings"
      :subtitle="xs || !store.isWeb ? `v${appVersion}` : ''"
    >
      <v-container>
        <v-row align="center">
          <v-col cols="5" sm="3">
            <v-icon :icon="mdiSourceBranch" class="mb-1 mr-2" /> Network
          </v-col>
          <v-col class="text-right pb-0">
            <v-btn
              v-for="item in algoNetworks"
              :key="item"
              :text="item"
              :variant="store.networkName === item ? 'tonal' : 'plain'"
              :color="store.networkName === item ? 'primary' : ''"
              :size="xs ? 'x-small' : 'default'"
              @click="setNetwork(item)"
            />
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col class="text-right pt-0">
            <v-btn
              v-for="item in altNetworks"
              :key="item"
              :text="item"
              :variant="store.networkName === item ? 'tonal' : 'plain'"
              :color="store.networkName === item ? 'primary' : ''"
              :size="xs ? 'x-small' : 'default'"
              @click="setNetwork(item)"
            />
            <v-btn
              text="Custom"
              variant="plain"
              color=""
              :size="xs ? 'x-small' : 'default'"
              @click="showCustom = true"
            />
            <v-btn
              v-for="item in customNetworks"
              :key="item"
              :text="item"
              :variant="store.networkName === item ? 'tonal' : 'plain'"
              :color="store.networkName === item ? 'primary' : ''"
              :size="xs ? 'x-small' : 'default'"
              @click="setNetwork(item)"
            />
          </v-col>
        </v-row>
        <v-row :class="store.networkName !== 'LocalNet' ? 'text-grey' : ''">
          <v-col cols="5" sm="3" lg="4">
            <v-icon :icon="mdiTrayArrowDown" class="mb-1 mr-2" /> Inbox Router
            (LocalNet Only)
          </v-col>
          <v-col>
            <v-row class="text-center" align="center" justify="end">
              <v-col cols="9" sm="5" md="3" lg="2">
                <v-btn
                  text="Create New"
                  @click="createRouter()"
                  :disabled="store.networkName !== 'LocalNet'"
                />
              </v-col>
              <v-col cols="3" sm="2" lg="1"> OR </v-col>
              <v-col cols="12" sm="5" md="5" lg="4">
                <v-text-field
                  v-model.number="store.network.inboxRouter"
                  :key="store.loading"
                  label="Existing App ID"
                  hide-details
                  density="compact"
                  :append-inner-icon="mdiContentSave"
                  @click:append-inner="setRouter()"
                  @keyup.enter="setRouter()"
                  :disabled="store.networkName !== 'LocalNet'"
                />
              </v-col>
            </v-row>
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon :icon="mdiThemeLightDark" class="mb-1 mr-2" /> Theme
            <div style="color: #9aa0a5; font-size: 0.7em">
              Gold theme for Lutier holders only
            </div>
          </v-col>
          <v-col>
            <v-radio-group
              :model-value="store.theme"
              @update:model-value="store.setTheme"
              inline
              class="d-flex"
              style="justify-content: right"
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
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon :icon="mdiKeyChange" class="mb-1 mr-2" /> Wallet Password
            <div
              v-if="store.keystoreMode === 'password'"
              style="color: #9aa0a5; font-size: 0.7em"
            >
              Protects every account stored in this browser: HD, Algo25 and
              Falcon. Ledger and passkey accounts are not affected.
            </div>
            <div v-else class="text-warning" style="font-size: 0.7em">
              Not set. Accounts stored in this browser sign without a password,
              and anyone with access to this browser profile can use them and
              export their mnemonics.
            </div>
          </v-col>
          <v-col class="text-right">
            <template v-if="store.keystoreMode === 'password'">
              <v-btn
                text="Change"
                :size="xs ? 'small' : 'default'"
                @click="showRotate = true"
              />
              <v-btn
                v-if="store.hasKeystore"
                text="Remove"
                variant="plain"
                color="error"
                :size="xs ? 'small' : 'default'"
                @click="showRemove = true"
              />
              <v-btn
                v-else
                text="Forgot"
                variant="plain"
                :size="xs ? 'small' : 'default'"
                @click="forgotPassword()"
              />
            </template>
            <v-btn
              v-else
              text="Set Password"
              :size="xs ? 'small' : 'default'"
              @click="showCreate = true"
            />
          </v-col>
        </v-row>
        <v-row
          v-if="!store.isWeb && store.keystoreMode === 'password'"
          align="center"
        >
          <v-col>
            <v-icon :icon="mdiLockClock" class="mb-1 mr-2" /> Lock After
            Inactivity
            <div style="color: #9aa0a5; font-size: 0.7em">
              Skip the password when signing with any account stored in this
              browser, until the wallet has been idle this long. Always locks 8
              hours after initial unlock, regardless of activity.
            </div>
          </v-col>
          <v-col>
            <v-row align="center" justify="end" no-gutters>
              <v-col cols="7" sm="5">
                <v-select
                  :model-value="store.autoLockMinutes"
                  @update:model-value="setAutoLock"
                  :items="autoLockOptions"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="5" sm="4" class="text-right">
                <v-btn
                  text="Lock Now"
                  size="small"
                  variant="tonal"
                  :disabled="!store.unlocked"
                  @click="lockNow()"
                />
              </v-col>
            </v-row>
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon :icon="mdiSync" class="mb-1 mr-2" /> Sync
            <div style="color: #9aa0a5; font-size: 0.7em">
              Copy this wallet's accounts and keys to the Lute
              {{ store.isWeb ? "extension" : "web app" }} in this browser. Your
              mnemonics are your backup; keep them safe.
            </div>
          </v-col>
          <v-col class="text-right">
            <v-btn
              v-if="!store.isWeb || canSyncToExtension"
              :text="store.isWeb ? 'Sync to Extension' : 'Sync to Web App'"
              :size="xs ? 'small' : 'default'"
              @click="startSync()"
            />
            <div v-else style="color: #9aa0a5; font-size: 0.8em">
              Install the Lute extension to sync
            </div>
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon :icon="mdiEye" class="mb-1 mr-2" /> Snoop Mode
            <div style="color: #9aa0a5; font-size: 0.7em">
              Allow connecting to dApps with Watch accounts
            </div>
          </v-col>
          <v-col>
            <v-switch
              :model-value="store.snoop"
              class="d-flex"
              style="justify-content: right"
              :label="store.snoop ? 'Enabled' : 'Disabled'"
              color="primary"
              @click.prevent="setSnoop()"
            />
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon :icon="mdiBug" class="mb-1 mr-2" /> Debug Logging
            <div style="color: #9aa0a5; font-size: 0.7em">
              Verbose logging to the console
            </div>
          </v-col>
          <v-col>
            <v-switch
              :model-value="store.debug"
              class="d-flex"
              style="justify-content: right"
              :label="store.debug ? 'Enabled' : 'Disabled'"
              color="primary"
              @click.prevent="setDebug()"
            />
          </v-col>
        </v-row>
        <v-row align="center">
          <v-col>
            <v-icon class="mb-1 mr-2">
              <ledger-icon :width="18" color="currentColor" />
            </v-icon>
            Manual Ledger Select
            <div style="color: #9aa0a5; font-size: 0.7em">
              Always pick which Ledger device to connect
            </div>
          </v-col>
          <v-col>
            <v-switch
              :model-value="store.ledgerSelect"
              class="d-flex"
              style="justify-content: right"
              :label="store.ledgerSelect ? 'Enabled' : 'Disabled'"
              color="primary"
              @click.prevent="setLedgerSelect()"
            />
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-container>
  <CustomNetwork :visible="showCustom" @close="showCustom = false" />
  <PasswordRotate :visible="showRotate" @close="showRotate = false" />
  <PasswordRemove :visible="showRemove" @close="showRemove = false" />
  <keystore-unlock ref="unlocker" />
  <v-dialog v-model="showCreate" max-width="600" persistent>
    <password-create @close="showCreate = false" />
  </v-dialog>
  <v-dialog :model-value="!!sync" max-width="520" persistent>
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
import {
  mdiBug,
  mdiContentSave,
  mdiEye,
  mdiKeyChange,
  mdiLockClock,
  mdiSourceBranch,
  mdiSync,
  mdiThemeLightDark,
  mdiTrayArrowDown,
} from "@mdi/js";
import { useDisplay, useTheme } from "vuetify";

const appVersion = __APP_VERSION__;
const { xs } = useDisplay();
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
  store.setSnackbar("Wallet Locked", "success", 2000);
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
  store.setSnackbar("Router ID Set", "success", 2000);
  store.loading--;
}
</script>
