<template>
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
          @click="$emit('rename', item.addr)"
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
          v-if="item.seedId && getCredential(item.seedId)"
          title="Backup HD Seed"
          :prepend-icon="mdiFormatListNumbered"
          @click="getMnemonic(item.seedId)"
        />
      </template>
      <v-list-item
        v-if="false /*item.seedId*/"
        title="Export Key"
        :prepend-icon="mdiKey"
        @click="exportChildKey(item)"
      />
      <v-list-item
        v-if="!store.isWeb"
        :title="(item.isX402 ? 'Unset' : 'Set') + ' as x402'"
        :prepend-icon="mdiCurrencyUsd"
        @click="toggleX402(item)"
      />
      <v-list-item
        v-if="!item.subType"
        title="Remove Account"
        :prepend-icon="mdiDelete"
        base-color="error"
        @click="removeAccount(item.addr)"
      />
    </v-list>
  </v-menu>
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script lang="ts" setup>
import { networks } from "@/data";
import { del, set } from "@/dbLute";
import HdWallet from "@/services/HdWallet";
import Seed from "@/services/Seed";
import type { AccountInfo, LuteAccount, SeedData, x402Account } from "@/types";
import { copyToClipboard, deepClone } from "@/utils";
import {
  mdiArrowDownThin,
  mdiArrowUpThin,
  mdiCheck,
  mdiContentCopy,
  mdiCurrencyUsd,
  mdiCursorMove,
  mdiDelete,
  mdiFormatListNumbered,
  mdiFormatVerticalAlignBottom,
  mdiFormatVerticalAlignTop,
  mdiInformationOutline,
  mdiKey,
  mdiMenuDown,
  mdiPencil,
  mdiSourceBranch,
} from "@mdi/js";
import { useDisplay } from "vuetify";

defineProps<{ item: AccountInfo }>();
defineEmits(["rename"]);

const { smAndUp } = useDisplay();
const store = useAppStore();
const showPass = ref(false);

const networkNames = ["All"].concat(networks.map((n) => n.name));

async function removeAccount(addr: string) {
  if (
    !confirm(
      `If you remove this account it will still exist on the blockchain but you will not be able to access it in Lute.

Are you sure you want to continue?`
    )
  )
    return;
  await del("keys", addr);
  await del("falcon25-seeds", addr);
  const ix = store.accounts.findIndex((a) => a.addr === addr);
  if (ix !== -1) {
    const newVal = deepClone(store.accounts.toSpliced(ix, 1));
    await set("app", "accounts", newVal);
    await store.getCache();
    store.refresh++;
  }
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

function getCredential(seedId: number) {
  return store.seeds.find((s) => s.id === seedId)?.credentialId;
}

const showMnemonic = ref(false);
const mnemonicArray = ref<string[]>([]);

async function getMnemonic(seedId: number) {
  const { mn } = await Seed.getPasskeyMnemonic(getCredential(seedId));
  mnemonicArray.value = mn.split(" ");
  showMnemonic.value = true;
  store.snackbar.display = false;
}

let acctInfo: AccountInfo;
let seedData: SeedData | undefined;
async function exportChildKey(ai: AccountInfo) {
  acctInfo = ai;
  seedData = store.seeds.find((s) => s.id === acctInfo.seedId);
  if (!seedData) throw Error("Invalid Seed");
  if (seedData.data) showPass.value = true;
}

async function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    const backupKey = await HdWallet.deriveChildKey(pass, acctInfo, seedData);
    console.log(backupKey);
  }
}

async function toggleX402(ai: AccountInfo) {
  const x402 = deepClone(store.x402Accounts) as x402Account[];
  const idx = x402.findIndex((a) => a.network === store.networkName);
  if (idx >= 0) {
    if (ai.isX402) x402.splice(idx, 1);
    else x402[idx].addr = ai.addr;
  } else x402.push({ network: store.networkName, addr: ai.addr });
  await set("app", "x402Accounts", x402);
  await store.getCache();
}
</script>
