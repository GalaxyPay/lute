<template>
  <new-key
    v-if="mn25"
    :number-of-words="25"
    :convertion="mn25"
    @close="$emit('close')"
  />
  <template v-else>
    <v-tabs v-model="wallet" class="flow-tabs">
      <v-tab v-for="item in wallets" :key="item" :text="item" :value="item" />
    </v-tabs>
    <template v-if="isLedger && !understood">
      <div class="dialog-body d-flex flex-column ga-4">
        <v-alert type="warning" variant="tonal">
          <div class="d-flex flex-column ga-3">
            <p>
              <span class="font-weight-bold">Emergency recovery only.</span> If
              your Ledger device is lost or broken, you can recover one of its
              Algorand accounts here as a hot account.
            </p>
            <p>
              Entering your Ledger mnemonic exposes it to this computer and
              browser. Afterwards, treat
              <span class="font-weight-bold"
                >every account it protects as HOT</span
              >, on every blockchain (not just Algorand). To regain
              hardware-level security, generate a new mnemonic on a Ledger and
              move your funds to new accounts as soon as you can.
            </p>
            <p>
              If you can wait, restoring your mnemonic onto a new Ledger device
              is safer. Never do this because someone told you to. Anyone asking
              you to is likely trying to steal your funds.
            </p>
          </div>
        </v-alert>
        <p class="text-text-body">
          If you are simply trying to securely pair your Ledger with Lute, go
          back and choose <b>Ledger account</b> instead.
        </p>
      </div>
      <v-card-actions class="justify-space-between">
        <v-btn
          color="text-body"
          :prepend-icon="mdiChevronLeft"
          text="Back"
          @click="$emit('back')"
        />
        <v-btn variant="flat" text="I understand" @click="understood = true" />
      </v-card-actions>
    </template>
    <import-key
      v-else
      :key="numberOfWords"
      :number-of-words="numberOfWords"
      button-text="Convert"
      @mn="handleMnemonic"
    >
      <div v-if="isLedger">
        <div class="d-flex align-center flex-wrap column-gap-2">
          <v-btn
            size="small"
            class="ml-n3"
            :append-icon="showAdvanced ? mdiChevronUp : mdiChevronDown"
            text="Advanced"
            @click="showAdvanced = !showAdvanced"
          />
        </div>
        <v-expand-transition>
          <!-- v-show needs a wrapper: d-flex's !important beats display: none. -->
          <div v-show="showAdvanced">
            <div class="d-flex flex-column ga-3 pt-2">
              <div class="d-flex align-center ga-3">
                <v-btn-toggle
                  v-model="numberOfWords"
                  mandatory
                  density="compact"
                  variant="outlined"
                  divided
                >
                  <v-btn
                    v-for="n in [12, 18, 24]"
                    :key="n"
                    :value="n"
                    :text="`${n}`"
                  />
                </v-btn-toggle>
                <span class="text-muted text-body-2">words</span>
              </div>
              <v-text-field
                v-model="passphrase"
                label="Passphrase"
                density="compact"
                hide-details
                :type="showPassphrase ? 'text' : 'password'"
                :append-inner-icon="showPassphrase ? mdiEyeOff : mdiEye"
                autocomplete="off"
                @click:append-inner="showPassphrase = !showPassphrase"
              />
              <v-text-field
                v-model.number="account"
                label="Account index"
                type="number"
                min="0"
                density="compact"
                hide-details="auto"
                :hint="`m/44'/283'/${account}'/0/0`"
                persistent-hint
                :rules="[validIndex]"
              />
            </div>
          </div>
        </v-expand-transition>
      </div>
    </import-key>
  </template>
</template>

<script setup lang="ts">
import LedgerRecovery from "@/services/LedgerRecovery";
import {
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronUp,
  mdiEye,
  mdiEyeOff,
} from "@mdi/js";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import algosdk from "algosdk";
import slip10 from "micro-key-producer/slip10.js";

defineEmits(["close", "back"]);

const store = useAppStore();
const wallets = ["Exodus", "Trust", "Coinomi", "Ledger"];
const wallet = ref("Exodus");
const isLedger = computed(() => wallet.value === "Ledger");
const numberOfWords = ref(12);
const mn25 = ref();

// Ledger: the risk warning must be acknowledged before the mnemonic is entered.
const understood = ref(false);
// Ledger advanced options; the defaults match a device with no passphrase.
const showAdvanced = ref(false);
const passphrase = ref("");
const showPassphrase = ref(false);
const account = ref(0);
const validIndex = (v: number) =>
  (Number.isInteger(v) && v >= 0 && v < 0x80000000) || "Invalid index";

watch(isLedger, (val) => {
  numberOfWords.value = val ? 24 : 12;
  // Leaving the Ledger tab means the warning is shown again on return.
  if (!val) understood.value = false;
});

async function handleMnemonic(mn: string) {
  if (!bip39.validateMnemonic(mn, wordlist)) {
    store.setSnackbar("Invalid mnemonic, check the words and order", "error");
    return;
  }
  if (isLedger.value) {
    if (validIndex(account.value) !== true) {
      store.setSnackbar("Invalid account index", "error");
      return;
    }
    const rootKey = LedgerRecovery.root(mn, passphrase.value);
    passphrase.value = "";
    try {
      mn25.value = await LedgerRecovery.mnemonic(rootKey, account.value);
    } finally {
      rootKey.fill(0);
    }
    return;
  }
  const seed = bip39.mnemonicToSeedSync(mn);
  let hdKey: HDKey | slip10;
  if (wallet.value === "Exodus") {
    const rootKey = HDKey.fromMasterSeed(seed);
    hdKey = rootKey.derive(`m/44'/283'/0'/0/0`);
  } else {
    const rootKey = slip10.fromMasterSeed(seed);
    hdKey = rootKey.derive(`m/44'/283'/0'/0'/0'`);
  }
  if (!hdKey.privateKey) throw Error("Invalid Key");
  mn25.value = algosdk.mnemonicFromSeed(hdKey.privateKey);
}
</script>
