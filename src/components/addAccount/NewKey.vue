<template>
  <v-container v-show="page === 0">
    <v-card-text>
      On the next screen you will be provided with the address and mnemonic for
      your
      {{
        isBip39
          ? "HD wallet"
          : props.convertion
            ? "converted account"
            : "new account"
      }}.
    </v-card-text>
    <v-card-text>It will only be shown once.</v-card-text>
    <v-card-text>
      Make sure you have a secure location to store your mnemonic. It is the
      only way to recover your {{ isBip39 ? "wallet" : "account" }} in the
      future.
    </v-card-text>
    <v-card-text>
      If your mnemonic is lost, you will be locked out of your
      {{ isBip39 ? "wallet" : "account" }} <b>FOREVER</b>.
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
    <v-card-text v-if="!isBip39">
      <div class="text-h6 pb-2 d-flex">
        Address: <v-spacer />
        <v-btn text="Copy" @click="copyToClipboard(acct.addr.toString())" />
      </div>
      <div style="font-family: monospace">{{ acct.addr }}</div>
    </v-card-text>
    <v-card-text>
      <div class="text-h6 pb-2 d-flex">
        Mnemonic: <v-spacer />
        <v-btn text="Copy" @click="copyToClipboard(mnemonicArray.join(' '))" />
      </div>
      <v-row style="font-family: monospace">
        <v-col
          v-for="n in props.numberOfWords"
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
      Make sure you have the entire
      <b>{{ props.numberOfWords }}-word mnemonic</b>, or you will
      <b>lose access to this {{ isBip39 ? "wallet" : "account" }} forever</b>.
      You will <b>not</b> be able to recover it.
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
import { set } from "@/dbLute";
import Seed from "@/services/Seed";
import type { LuteAccount } from "@/types";
import { copyToClipboard, deepClone, storeKey } from "@/utils";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import algosdk from "algosdk";

const props = defineProps({
  numberOfWords: { type: Number, required: true },
  convertion: { type: String },
});

const emit = defineEmits(["close", "hideTabs", "seed"]);
const show = ref(false);
const store = useAppStore();
const isBip39 = computed(() => props.numberOfWords === 24);
const acct = props.convertion
  ? algosdk.mnemonicToSecretKey(props.convertion)
  : algosdk.generateAccount();
const mn = isBip39.value
  ? bip39.generateMnemonic(wordlist, 256)
  : algosdk.secretKeyToMnemonic(acct.sk);
const mnemonicArray = mn.split(" ");
const page = ref(0);
const challenge = Math.floor(Math.random() * props.numberOfWords) + 1;
const form = ref();
const match = (v: string) => v === mnemonicArray[challenge - 1] || "Incorrect";

async function submit() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    if (isBip39.value) {
      show.value = true;
    } else {
      await storeKey(acct);
      const accts: LuteAccount[] = deepClone(store.accounts);
      accts.push({ addr: acct.addr.toString() });
      await set("app", "accounts", accts);
      await store.getCache();
      store.refresh++;
      store.setSnackbar("Account Created", "success");
      emit("close");
    }
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
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
