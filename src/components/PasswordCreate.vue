<template>
  <v-card>
    <v-card-title class="d-flex">
      Add A Password
      <v-spacer />
      <v-icon :icon="mdiClose" size="small" @click="emit('close')" />
    </v-card-title>
    <v-container>
      <v-form
        ref="form"
        @submit.prevent="confirmPassword()"
        validate-on="submit"
      >
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
        <v-card-actions>
          <v-spacer />
          <v-btn text="Submit" type="submit" />
        </v-card-actions>
      </v-form>
    </v-container>
  </v-card>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import { decodeField } from "@/utils";
import { mdiClose } from "@mdi/js";

const store = useAppStore();
const required = (v: string) => !!v || "Required";
const match = (v: string) => v === pass1.value || "Mismatch";
const form = ref();
const pass1 = ref();
const pass2 = ref();

const emit = defineEmits(["close"]);

async function confirmPassword() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    const saltArray = crypto.getRandomValues(new Uint8Array(12));
    const salt = decodeField(saltArray, "base64");
    const passwordArray = new TextEncoder().encode(pass1.value);
    const concatArray = new Uint8Array([...passwordArray, ...saltArray]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", concatArray);
    const hashArray = new Uint8Array(hashBuffer);
    const hash = decodeField(hashArray, "base64");
    await set("app", "password", { salt, hash });
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
