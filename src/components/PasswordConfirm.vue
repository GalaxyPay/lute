<template>
  <v-dialog v-model="show" max-width="400" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Enter your Password
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="show = false" />
      </v-card-title>
      <v-container>
        <v-form
          ref="form"
          @submit.prevent="confirmPassword()"
          validate-on="submit"
        >
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
          <v-card-actions>
            <v-spacer />
            <v-btn text="Submit" type="submit" />
          </v-card-actions>
        </v-form>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { get } from "@/dbLute";
import { mdiClose } from "@mdi/js";

const store = useAppStore();
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
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    const pass = await get("app", "password");
    if (!pass) throw Error("Password not found");
    const saltArr = Buffer.from(pass.salt, "base64");
    const passArr = new TextEncoder().encode(password.value);
    const hash = Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array([...passArr, ...saltArr])
      )
    ).toString("base64");

    if (hash === pass.hash) emit("close", true, password.value);
    else emit("close", false);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
