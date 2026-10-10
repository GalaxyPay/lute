<template>
  <v-dialog v-model="show" max-width="440" persistent>
    <v-card :loading="removing" :disabled="removing">
      <v-card-title class="d-flex">
        Remove password
        <v-spacer />
        <v-icon :icon="mdiClose" @click="show = false" />
      </v-card-title>
      <v-form ref="form" @submit.prevent="remove()" validate-on="submit">
        <v-card-text>
          <v-alert type="warning" class="mb-3">
            Without a password, anyone with access to this browser profile can
            sign with the accounts stored in it, and reveal their mnemonics.
          </v-alert>
          <p class="text-muted text-body-2 mb-2">
            Every account stored in this browser is re-encrypted under a key
            that never leaves the browser. You can set a password again at any
            time.
          </p>
          <v-text-field
            v-model="current"
            label="Current password"
            type="password"
            name="current-password"
            autocomplete="current-password"
            density="comfortable"
            :rules="[required]"
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-btn
            variant="flat"
            text="Remove password"
            color="danger-fill"
            type="submit"
            :loading="removing"
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
      store.setSnackbar("Incorrect password", "error");
      return;
    }
    await store.getCache();
    store.setSnackbar("Password removed", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(`Password unchanged. ${err.message}`, "error");
  } finally {
    removing.value = false;
  }
}
</script>
