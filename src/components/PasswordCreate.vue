<template>
  <v-card>
    <v-card-title class="d-flex">
      Set a Wallet Password
      <v-spacer />
      <v-icon :icon="mdiClose" @click="emit('close', false)" />
    </v-card-title>
    <v-form ref="form" @submit.prevent="confirmPassword()" validate-on="submit">
      <v-card-text>
        <p class="text-muted text-body-2 mb-2">
          Protects every account stored in this browser. There is no way to
          recover it: if you forget it, you will need your mnemonics.
        </p>
        <v-text-field v-show="false" name="username" autocomplete="username" />
        <v-text-field
          v-model="pass1"
          label="Password"
          type="password"
          name="password"
          autocomplete="new-password"
          density="comfortable"
          :rules="[required]"
          autofocus
        />
        <v-text-field
          v-model="pass2"
          label="Confirm Password"
          type="password"
          name="confirm-password"
          autocomplete="new-password"
          density="comfortable"
          :rules="[required, match]"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn variant="flat" text="Submit" type="submit" :loading="saving" />
      </v-card-actions>
    </v-form>
  </v-card>
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import { mdiClose } from "@mdi/js";

const store = useAppStore();
const required = (v: string) => !!v || "Required";
const match = (v: string) => v === pass1.value || "Mismatch";
const form = ref();
const pass1 = ref();
const pass2 = ref();
const saving = ref(false);

const emit = defineEmits(["close"]);

async function confirmPassword() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    saving.value = true;
    await Keystore.newPassword(pass1.value);
    await store.getCache();
    store.setSnackbar("Password Set", "success");
    emit("close", true);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    saving.value = false;
  }
}
</script>
