<template>
  <v-dialog
    :model-value="!!account"
    :max-width="words.length ? 520 : 440"
    persistent
  >
    <v-card v-if="account">
      <v-card-title class="d-flex">
        {{ words.length ? "Mnemonic" : "Export Mnemonic" }}
        <v-spacer />
        <v-icon :icon="mdiClose" @click="close()" />
      </v-card-title>
      <template v-if="!words.length">
        <v-card-text>
          This mnemonic gives full control of
          <b class="text-high-emphasis">{{
            hd ? "every account on this seed" : "this account"
          }}</b
          >. Anyone who sees it can take your funds, so only reveal it somewhere
          private.
        </v-card-text>
        <v-card-text
          v-if="!passkey && store.keystoreMode === 'device'"
          class="text-warning pt-0"
        >
          This wallet has no password, so revealing the mnemonic needs no
          confirmation.
        </v-card-text>
        <v-card-actions>
          <v-btn text="Cancel" color="text-body" @click="close()" />
          <v-btn
            variant="flat"
            text="Reveal"
            color="warning"
            :loading="busy"
            @click="reveal()"
          />
        </v-card-actions>
      </template>
      <template v-else>
        <v-card-text>
          <mnemonic-display :words="words" />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="outlined" text="Close" @click="close()" />
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import { isHd, keystoreId, secretKind } from "@/services/accountSecret";
import Keystore from "@/services/Keystore";
import Seed from "@/services/Seed";
import type { AccountInfo, Unlocker } from "@/types";
import { isCancelled } from "@/utils";
import { mdiClose } from "@mdi/js";

const props = defineProps<{ account?: AccountInfo }>();
const emit = defineEmits(["close"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const words = ref<string[]>([]);
const busy = ref(false);
const hd = computed(() => !!props.account && isHd(props.account));
const passkey = computed(() => props.account?.secret === "passkey");

async function reveal() {
  const acct = props.account;
  if (!acct) return;
  busy.value = true;
  try {
    let mn: string;
    if (passkey.value) {
      const sd = store.seeds.find((s) => s.id === acct.seedId);
      ({ mn } = await Seed.getPasskeyMnemonic(sd?.credentialId));
    } else {
      const kind = secretKind(acct, store);
      if (!kind) throw Error("This account has no mnemonic stored here");
      // Always the typed password: an unlocked session is not enough.
      const mk = await unlocker.value!.ensureMk({ fresh: true });
      mn = await Keystore.exportMnemonic(mk, keystoreId(kind, acct));
    }
    words.value = mn.split(" ");
  } catch (err: any) {
    if (isCancelled(err) || err?.code === "aborted") return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    busy.value = false;
  }
}

function close() {
  words.value = [];
  emit("close");
}
</script>
