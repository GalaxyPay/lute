<template>
  <import-key :number-of-words="24" button-text="Import" @mn="handleMnemonic">
    <slot />
  </import-key>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import type { Unlocker } from "@/types";
import { isCancelled } from "@/utils";
import * as bip39 from "@scure/bip39";

const emit = defineEmits(["seed"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();

async function handleMnemonic(mn: string) {
  try {
    const mk = await unlocker.value!.ensureMk();
    const id = await Keystore.storeMnemonic(mk, "bip39", mn);
    const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
    emit("seed", Number(id.split(":")[1]), seed);
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
