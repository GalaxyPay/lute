<template>
  <div class="pl-12">Passkey Seed</div>
  <v-container class="pt-0">
    <v-container>
      <v-card variant="outlined" color="primary" class="pointer">
        <v-container
          :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
          @click="register()"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiKeyPlus" />
            </v-col>
            <v-col>
              Register a New Passkey
              <div class="text-grey">
                Creates a new seed. Your device will prompt you twice, once to
                register and once to derive the seed.
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-container>
    <v-container>
      <v-card variant="outlined" color="primary" class="pointer">
        <v-container
          :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
          @click="restore()"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiFingerprint" />
            </v-col>
            <v-col>
              Use an Existing Passkey
              <div class="text-grey">
                Recovers the seed from a passkey already registered on your
                device.
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-container>
  </v-container>
</template>

<script lang="ts" setup>
import Seed from "@/services/Seed";
import { mdiFingerprint, mdiKeyPlus } from "@mdi/js";
import { useTheme } from "vuetify";

const emit = defineEmits(["close", "seed"]);

const store = useAppStore();
const theme = useTheme();

async function register() {
  try {
    const credentialId = await Seed.registerPasskey();
    const { seed } = await Seed.getPasskeySeed(credentialId);
    const seedId = await Seed.storePasskeyCred(credentialId);
    emit("seed", seedId, seed);
  } catch (err: any) {
    handleError(err);
  }
}

async function restore() {
  try {
    const { seed, credentialId } = await Seed.getPasskeySeed();
    const seedId = await Seed.storePasskeyCred(credentialId);
    emit("seed", seedId, seed);
  } catch (err: any) {
    handleError(err);
  }
}

function handleError(err: any) {
  console.error(err);
  store.setSnackbar(err.message, err.code === "aborted" ? "info" : "error");
}
</script>
