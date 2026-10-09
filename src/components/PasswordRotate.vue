<template>
  <v-dialog v-model="show" max-width="440" persistent>
    <v-card :loading="rotating" :disabled="rotating">
      <v-card-title class="d-flex">
        Change Password
        <v-spacer />
        <v-icon :icon="mdiClose" @click="show = false" />
      </v-card-title>
      <v-form ref="form" @submit.prevent="rotate()" validate-on="submit">
        <v-card-text>
          <p class="text-warning text-body-2 mb-1">
            Make sure your recovery phrase(s) are backed up before continuing.
          </p>
          <p class="text-muted text-body-2 mb-2">
            The password protects every account stored in this browser: HD,
            Algo25 and Falcon. Ledger, watch, multi-sig, and passkey accounts
            are not affected.
          </p>
          <v-text-field
            v-show="false"
            name="username"
            autocomplete="username"
          />
          <v-text-field
            v-model="current"
            label="Current Password"
            type="password"
            name="current-password"
            autocomplete="current-password"
            density="comfortable"
            :rules="[required]"
            autofocus
          />
          <v-text-field
            v-model="pass1"
            label="New Password"
            type="password"
            name="new-password"
            autocomplete="new-password"
            density="comfortable"
            :rules="[required, changed]"
          />
          <v-text-field
            v-model="pass2"
            label="Confirm New Password"
            type="password"
            name="confirm-password"
            autocomplete="new-password"
            density="comfortable"
            :rules="[required, match]"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn
            variant="flat"
            text="Submit"
            type="submit"
            :loading="rotating"
          />
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import { mdiClose } from "@mdi/js";

const store = useAppStore();
const required = (v: string) => !!v || "Required";
const match = (v: string) => v === pass1.value || "Mismatch";
const changed = (v: string) => v !== current.value || "Must differ";
const form = ref();
const current = ref();
const pass1 = ref();
const pass2 = ref();
const rotating = ref(false);

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const show = computed({
  get() {
    return props.visible;
  },
  set(val) {
    if (!val) emit("close");
  },
});

watch(
  () => props.visible,
  (val) => {
    if (val) current.value = pass1.value = pass2.value = undefined;
  }
);

async function rotate() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    rotating.value = true;
    if (!(await Keystore.rotate(current.value, pass1.value))) {
      store.setSnackbar("Incorrect Password", "error");
      return;
    }
    await store.getCache();
    store.setSnackbar("Password Changed", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    // Nothing was written: the new header is committed in one transaction, so
    // the old password still works.
    store.setSnackbar(`Password unchanged. ${err.message}`, "error");
  } finally {
    rotating.value = false;
  }
}
</script>
