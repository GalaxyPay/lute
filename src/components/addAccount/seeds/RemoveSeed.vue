<template>
  <v-dialog :model-value="!!row" max-width="520" persistent>
    <v-card v-if="row">
      <v-card-title class="d-flex">
        Remove Seed
        <v-spacer />
        <v-icon :icon="mdiClose" @click="close()" />
      </v-card-title>
      <template v-if="row.credentialId">
        <v-card-text>
          Lute will forget this passkey seed. The passkey itself stays on your
          authenticator, so the seed can be added back with "Recover from a
          passkey".
        </v-card-text>
      </template>
      <template v-else-if="!seed">
        <v-card-text>
          This seed has no accounts in Lute, but its addresses can still hold
          funds. Removing it deletes it from this browser, and only its mnemonic
          can bring it back.
        </v-card-text>
        <v-card-text class="pt-0">
          You will be asked for your password and to confirm you have the
          mnemonic.
        </v-card-text>
      </template>
      <template v-else>
        <v-card-text>
          <v-alert v-if="scanning" type="info">
            Checking the first {{ SCAN }} accounts on this seed…
          </v-alert>
          <v-alert v-else-if="scanFailed" type="warning">
            Could not check this seed's accounts on the network.
          </v-alert>
          <v-alert v-else-if="inUse.length" type="error">
            These accounts on this seed hold funds or control other accounts.
            Add them to your wallet instead, or be certain you have the
            mnemonic.
            <div
              v-for="a in inUse"
              :key="a.address"
              class="text-caption font-mono"
            >
              {{ formatAddr(a.address) }}
              ({{ bigintToString(a.amount, 6)
              }}{{ a.subs?.length ? `, controls ${a.subs.length}` : "" }})
            </div>
          </v-alert>
          <v-alert v-else type="success">
            None of the first {{ SCAN }} accounts on this seed are in use.
          </v-alert>
        </v-card-text>
        <template v-if="words.length">
          <v-card-text class="pt-0">
            To confirm you have the mnemonic, what is word number
            <b class="text-high-emphasis">{{ challenge }}</b
            >?
            <v-text-field
              v-model="answer"
              class="challenge-field"
              density="compact"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
            />
            <mnemonic-display v-if="reveal" :words="words" class="mt-4" />
            <v-btn
              v-else
              size="small"
              class="mt-2 ml-n3"
              text="I don't have it, show the mnemonic"
              @click="reveal = true"
            />
          </v-card-text>
        </template>
        <template v-else>
          <v-card-text class="pt-0">
            This seed was added before mnemonic export, so enter its mnemonic to
            confirm you have it.
          </v-card-text>
          <import-key
            v-if="!verified"
            :number-of-words="24"
            button-text="Verify"
            @mn="checkMnemonic"
          />
          <v-card-text v-else class="text-success pt-0">
            Mnemonic matches.
          </v-card-text>
        </template>
      </template>
      <v-card-actions>
        <v-btn text="Cancel" color="text-body" @click="close()" />
        <v-btn
          v-if="!row.credentialId && !seed"
          variant="flat"
          text="Continue"
          :loading="busy"
          @click="unlock()"
        />
        <v-btn
          v-else
          variant="flat"
          text="Remove"
          color="danger-fill"
          :disabled="!canRemove"
          :loading="busy"
          @click="remove()"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import HdWallet from "@/services/HdWallet";
import Keystore from "@/services/Keystore";
import type { AccountSubs, SeedRow, Unlocker } from "@/types";
import { bigintToString, formatAddr, isCancelled } from "@/utils";
import { mdiClose } from "@mdi/js";
import * as bip39 from "@scure/bip39";

// Derived accounts checked on chain, in batches of HdWallet.deriveAccts.
const SCAN = 8;

const props = defineProps<{ row?: SeedRow }>();
const emit = defineEmits(["close", "removed"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const busy = ref(false);
const seed = shallowRef<Buffer>();
const words = ref<string[]>([]);
const challenge = ref(0);
const answer = ref("");
const reveal = ref(false);
const mnemonicOk = ref(false);
const scanning = ref(false);
const scanFailed = ref(false);
const inUse = ref<AccountSubs[]>([]);

const verified = computed(() =>
  words.value.length
    ? answer.value.trim().toLowerCase() === words.value[challenge.value - 1]
    : mnemonicOk.value
);
const canRemove = computed(
  () => !!props.row?.credentialId || (verified.value && !scanning.value)
);

async function unlock() {
  const row = props.row!;
  busy.value = true;
  try {
    // Always the typed password: an unlocked session is not enough.
    const mk = await unlocker.value!.ensureMk({ fresh: true });
    const { rec, plaintext } = await Keystore.getSecret(mk, `bip39:${row.id}`);
    try {
      if (Keystore.isExportable(rec.kind, rec.form))
        words.value = Keystore.mnemonicFromPlaintext(rec.kind, plaintext).split(
          " "
        );
      seed.value = Buffer.from(
        Keystore.signingMaterial(rec.kind, rec.form, plaintext)
      );
    } finally {
      plaintext.fill(0);
    }
    challenge.value = Math.floor(Math.random() * 24) + 1;
    scan(Buffer.from(seed.value));
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    busy.value = false;
  }
}

async function scan(sd: Buffer) {
  scanning.value = true;
  try {
    const accts: AccountSubs[] = [];
    for (let i = 0; i < SCAN; i += 4)
      accts.push(...(await HdWallet.deriveAccts(sd, i)));
    inUse.value = accts.filter(
      (a) => a.amount > 0n || !!a.authAddr || !!a.subs?.length
    );
  } catch (err) {
    console.error(err);
    scanFailed.value = true;
  } finally {
    sd.fill(0);
    scanning.value = false;
    store.snackbar.display = false;
  }
}

function checkMnemonic(mn: string) {
  const other = Buffer.from(bip39.mnemonicToSeedSync(mn));
  mnemonicOk.value = !!seed.value && other.equals(seed.value);
  other.fill(0);
  if (!mnemonicOk.value)
    store.setSnackbar("That mnemonic is not this seed's", "error");
}

async function remove() {
  busy.value = true;
  try {
    await Keystore.removeSeed(props.row!.id);
    await store.getCache();
    store.setSnackbar("Seed Removed", "success");
    emit("removed");
    close();
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    busy.value = false;
  }
}

function close() {
  seed.value?.fill(0);
  seed.value = undefined;
  words.value = [];
  answer.value = "";
  reveal.value = false;
  mnemonicOk.value = false;
  scanFailed.value = false;
  inUse.value = [];
  emit("close");
}
</script>

<style scoped>
.challenge-field {
  max-width: 220px;
  margin-top: 12px !important;
}
.challenge-field :deep(input) {
  font-family: var(--font-mono);
}
</style>
