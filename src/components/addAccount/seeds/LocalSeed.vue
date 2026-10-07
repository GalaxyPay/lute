<template>
  <v-container class="pt-0">
    <no-password-notice />
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
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
        <input-bip39 @seed="(id, seed) => $emit('seed', id, seed)" />
        <div class="text-center">
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="mdiFingerprint"
            text="Recover from a passkey"
            @click="recoverPasskey"
          />
        </div>
      </v-window-item>
    </v-window>
  </v-container>
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
