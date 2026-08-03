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
            <v-btn text="Submit" type="submit" :loading="checking" />
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
const form = ref();
const password = ref();
const checking = ref(false);

const props = defineProps({
  visible: { type: Boolean, default: false },
  verify: { type: Boolean, default: true },
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

    if (!props.verify) return emit("close", true, password.value);

    checking.value = true;
    if (await Seed.verifyPassword(password.value))
      emit("close", true, password.value);
    else emit("close", false);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    checking.value = false;
  }
}
</script>
