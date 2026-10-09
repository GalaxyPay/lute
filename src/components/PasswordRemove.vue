<template>
  <v-dialog v-model="show" max-width="500" persistent>
    <v-card :loading="removing" :disabled="removing">
      <v-card-title class="d-flex">
        Remove Password
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="show = false" />
      </v-card-title>
      <v-card-text class="text-warning pb-0">
        Without a password, anyone with access to this browser profile can sign
        with the accounts stored in it, and reveal their mnemonics.
      </v-card-text>
      <v-card-text class="pb-0 text-muted text-body-2">
        Every account stored in this browser is re-encrypted under a key that
        never leaves the browser. You can set a password again at any time.
      </v-card-text>
      <v-container>
        <v-form ref="form" @submit.prevent="remove()" validate-on="submit">
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
          <v-card-actions>
            <v-spacer />
            <v-btn
              text="Remove Password"
              color="error"
              type="submit"
              :loading="removing"
            />
          </v-card-actions>
        </v-form>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import { mdiClose } from "@mdi/js";

const store = useAppStore();
const required = (v: string) => !!v || "Required";
const form = ref();
const current = ref();
const removing = ref(false);

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
    if (val) current.value = undefined;
  }
);

async function remove() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    removing.value = true;
    if (!(await Keystore.removePassword(current.value))) {
      store.setSnackbar("Incorrect Password", "error");
      return;
    }
    await store.getCache();
    store.setSnackbar("Password Removed", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(`Password unchanged. ${err.message}`, "error");
  } finally {
    removing.value = false;
  }
}
</script>
