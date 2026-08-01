<template>
  <v-dialog v-model="show" max-width="500" persistent>
    <v-card :loading="rotating" :disabled="rotating">
      <v-card-title class="d-flex">
        Change Password
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="show = false" />
      </v-card-title>
      <v-card-text class="text-warning pb-0">
        Make sure your recovery phrase(s) are backed up before continuing.
      </v-card-text>
      <v-card-text class="pb-0" style="color: #9aa0a5; font-size: 0.8em">
        This re-encrypts every seed stored in this browser. Algo25, Ledger,
        watch, multi-sig, and passkey accounts are not affected because none of
        them are protected by this password.
      </v-card-text>
      <v-container>
        <v-form ref="form" @submit.prevent="rotate()" validate-on="submit">
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
          <v-card-actions>
            <v-spacer />
            <v-btn text="Submit" type="submit" :loading="rotating" />
          </v-card-actions>
        </v-form>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import Seed from "@/services/Seed";
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

const emit = defineEmits(["close", "getCache"]);

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
    if (!(await Seed.rotatePassword(current.value, pass1.value))) {
      store.setSnackbar("Incorrect Password", "error");
      return;
    }
    store.setSnackbar("Password Changed", "success");
    emit("getCache");
    emit("close");
  } catch (err: any) {
    console.error(err);
    // Nothing was written: rotation pre-flights every decrypt and commits in a
    // single transaction, so the old password still works.
    store.setSnackbar(`Password unchanged. ${err.message}`, "error");
  } finally {
    rotating.value = false;
  }
}
</script>
