<template>
  <v-container v-show="page === 0">
    <v-card-text>
      On the next screen you will be provided with the address and mnemonic for
      your {{ props.convert ? "converted" : "new" }} account.
    </v-card-text>
    <v-card-text>It will only be shown once.</v-card-text>
    <v-card-text>
      Make sure you have a secure location to store your mnemonic. It is the
      only way to recover your account in the future.
    </v-card-text>
    <v-card-text>
      If your mnemonic is lost, you will be locked out of your account
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
  <v-container v-show="page === 1" class="pt-0">
    <v-card-text>
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
        <v-col v-for="n in 25" :key="n" cols="6" sm="4" class="py-0">
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
      Make sure you have the entire <b>25-word mnemonic</b>, or you will
      <b>lose access to this account forever</b>. You will <b>not</b> be able to
      recover it.</v-card-text
    >
    <v-card-actions>
      <v-spacer />
      <v-btn text="Next" @click="page = 2" />
    </v-card-actions>
  </v-container>
  <v-container v-show="page === 2" class="pt-0">
    <v-form ref="form" @submit.prevent="saveAccount()" validate-on="submit">
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
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import type { LuteAccount } from "@/types";
import { copyToClipboard, deepClone, storeKey } from "@/utils";
import algosdk from "algosdk";

const props = defineProps({
  convert: { type: String },
});

const emit = defineEmits(["close", "hideTabs"]);

const store = useAppStore();
const acct = props.convert
  ? algosdk.mnemonicToSecretKey(props.convert)
  : algosdk.generateAccount();
const mnemonicArray = algosdk.secretKeyToMnemonic(acct.sk).split(" ");
const page = ref(0);
const challenge = Math.floor(Math.random() * 25) + 1;
const form = ref();
const match = (v: string) => v === mnemonicArray[challenge - 1] || "Incorrect";

async function saveAccount() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    await storeKey(acct);
    const accts: LuteAccount[] = deepClone(store.accounts);
    accts.push({ addr: acct.addr.toString() });
    await set("app", "accounts", accts);
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Account Created", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
