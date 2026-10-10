<template>
  <v-dialog v-model="show" max-width="400" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Enter your password
        <v-spacer />
        <v-icon :icon="mdiClose" @click="show = false" />
      </v-card-title>
      <v-form
        ref="form"
        @submit.prevent="confirmPassword()"
        validate-on="submit"
      >
        <v-card-text>
          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            name="password"
            autocomplete="password"
            density="comfortable"
            :rules="[required]"
            autofocus
          />
        </v-card-text>
        <v-card-actions class="no-divider pt-0">
          <v-btn variant="flat" text="Submit" type="submit" />
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
// Doesn't verify the password: the caller does, by using it (see KeystoreUnlock).
import { mdiClose } from "@mdi/js";

const required = (v: string) => !!v || "Required";
const form = ref();
const password = ref();

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const show = computed({
  get() {
    return props.visible;
  },
  set(val) {
    if (!val) {
      emit("close", "");
    }
  },
});

watch(
  () => props.visible,
  (val) => {
    if (val) password.value = undefined;
  }
);

async function confirmPassword() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  emit("close", true, password.value);
}
</script>
