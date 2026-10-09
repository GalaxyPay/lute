<template>
  <div v-if="store.keystoreMode === 'device'" class="flow-notice">
    <no-password-notice />
  </div>
  <v-tabs v-if="!hideTabs" v-model="tab" class="flow-tabs">
    <v-tab text="New" />
    <v-tab text="Import" />
  </v-tabs>
  <v-window v-model="tab">
    <v-window-item :value="0">
      <new-key
        :number-of-words="24"
        @hide-tabs="hideTabs = true"
        @seed="(id, seed) => $emit('seed', id, seed)"
      />
    </v-window-item>
    <v-window-item :value="1">
      <input-bip39 @seed="(id, seed) => $emit('seed', id, seed)">
        <div class="text-center">
          <v-btn
            size="small"
            :prepend-icon="mdiFingerprint"
            text="Recover from a passkey"
            @click="recoverPasskey"
          />
        </div>
      </input-bip39>
    </v-window-item>
  </v-window>
</template>

<script lang="ts" setup>
import Seed from "@/services/Seed";
import { mdiFingerprint } from "@mdi/js";

const emit = defineEmits(["seed"]);

const store = useAppStore();
const hideTabs = ref(false);
const tab = ref(0);

// Passkeys can no longer create seeds, but one registered with an earlier
// version can still be recovered on a new device.
async function recoverPasskey() {
  try {
    const { seed, credentialId } = await Seed.getPasskeySeed();
    const seedId = await Seed.storePasskeyCred(credentialId);
    emit("seed", seedId, seed);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, err.code === "aborted" ? "info" : "error");
  }
}
</script>
