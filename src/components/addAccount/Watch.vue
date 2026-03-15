<template>
  <v-container>
    <v-form ref="form" @submit.prevent="addWatch()">
      <v-combobox
        v-model="addr"
        :items="addrAuto"
        :return-object="false"
        :label="`Address${ns}`"
        spellcheck="false"
        @keyup="lookupNs(addr)"
        :rules="[required, validAddress]"
        autofocus
      />
      <v-card-actions>
        <v-spacer />
        <v-btn text="Add" type="submit" />
      </v-card-actions>
    </v-form>
  </v-container>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import NameService from "@/services/NameService";
import type { LuteAccount } from "@/types";
import { deepClone } from "@/utils";
import algosdk from "algosdk";

const emit = defineEmits(["close"]);
const store = useAppStore();
const ns = store.network.nfdUrl
  ? " or NFD"
  : store.network.envoiUrl
  ? " or EnVoi"
  : "";
const form = ref();
const addr = ref();
const addrAuto = ref();
const required = (v: string) => !!v || "Required";
const validAddress = (v: string) =>
  algosdk.isValidAddress(v) || "Invalid Address";

let nsTimeout: number;
async function lookupNs(q: string) {
  window.clearTimeout(nsTimeout);
  nsTimeout = window.setTimeout(async () => {
    addrAuto.value = q ? await NameService.search(q) : [];
  }, 500);
}

async function addWatch() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    const accts: LuteAccount[] = deepClone(store.accounts);
    if (accts.some((a) => a.addr === addr.value)) {
      emit("close");
      throw Error("Account Already Exists In Wallet");
    }
    accts.push({ addr: addr.value });
    await set("app", "accounts", accts);
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Watch Account Added", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
