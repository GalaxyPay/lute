<template>
  <input-mnemonic
    :number-of-words="24"
    button-text="Import"
    @convert="handleMnemonic"
  />
  <password-confirm :visible="show" @close="handlePass" />
</template>

<script lang="ts" setup>
import Seed from "@/services/Seed";

const emit = defineEmits(["seed"]);

const store = useAppStore();
const mnemonic = ref("");
const show = ref(false);

function handleMnemonic(mn: string) {
  mnemonic.value = mn;
  show.value = true;
}

async function handlePass(success: boolean, pass: string) {
  show.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    const { id, seed } = await Seed.storeBip39Seed(mnemonic.value, pass);
    emit("seed", id, seed);
  }
}
</script>
