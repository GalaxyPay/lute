<template>
  <v-container v-show="page === 0">
    <v-card-text>
      On the next screen you will be provided with the mnemonic for your HD
      wallet.
    </v-card-text>
    <v-card-text>It will only be shown once.</v-card-text>
    <v-card-text>
      Make sure you have a secure location to store your mnemonic. It is the
      only way to recover your wallet in the future.
    </v-card-text>
    <v-card-text>
      If your mnemonic is lost, you will be locked out of your wallet
      <b>FOREVER</b>.
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        text="Next"
        @click="
          page = 1;
          $emit('hideTabs');
        "
      />
    </v-card-actions>
  </v-container>
  <v-container v-show="page === 1" class="pt-0 px-0">
    <v-card-text>
      <div class="text-h6 pb-2 d-flex">
        Mnemonic: <v-spacer />
        <v-btn text="Copy" @click="copyToClipboard(mnemonicArray.join(' '))" />
      </div>
      <v-row style="font-family: monospace">
        <v-col
          v-for="n in NUMBER_OF_WORDS"
          :key="n"
          cols="6"
          sm="4"
          class="py-0"
        >
          <v-text-field
            :model-value="mnemonicArray[n - 1]"
            variant="plain"
            readonly
            hide-details
            density="compact"
          >
            <template #prepend>{{ n < 10 ? "&nbsp;" + n : n }}.</template>
          </v-text-field>
        </v-col>
      </v-row>
    </v-card-text>
    <v-card-text>
      Make sure you have the entire <b>{{ NUMBER_OF_WORDS }}-word mnemonic</b>,
      or you will <b>lose access to this wallet forever</b>. You will
      <b>not</b> be able to recover it.
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn text="Next" @click="page = 2" />
    </v-card-actions>
  </v-container>
  <v-container v-show="page === 2" class="pt-0">
    <v-form ref="form" @submit.prevent="submit()" validate-on="submit">
      <v-row justify="center">
        <v-col cols="6">
          <v-card-text>What is word number {{ challenge }}?</v-card-text>
          <v-text-field density="compact" :rules="[match]" />
        </v-col>
      </v-row>
      <v-card-actions>
        <v-spacer />
        <v-btn text="Create" type="submit" />
      </v-card-actions>
    </v-form>
  </v-container>
  <password-confirm :visible="show" @close="handlePass" />
</template>

<script lang="ts" setup>
import Seed from "@/services/Seed";
import { copyToClipboard } from "@/utils";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const emit = defineEmits(["hideTabs", "seed"]);
const NUMBER_OF_WORDS = 24;
const show = ref(false);
const store = useAppStore();
const mn = bip39.generateMnemonic(wordlist, 256);
const mnemonicArray = mn.split(" ");
const page = ref(0);
const challenge = Math.floor(Math.random() * NUMBER_OF_WORDS) + 1;
const form = ref();
const match = (v: string) => v === mnemonicArray[challenge - 1] || "Incorrect";

async function submit() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  show.value = true;
}

async function handlePass(success: boolean, pass: string) {
  show.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    const { id, seed } = await Seed.storeBip39Seed(mn, pass);
    emit("seed", id, seed);
  }
}
</script>
