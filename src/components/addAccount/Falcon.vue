<template>
  <v-container v-if="!passwordSet" class="px-1 text-center">
    <div>You must set a password in order to use this feature.</div>
    <v-btn class="my-4" text="Set Password" @click="showPass = true" />
  </v-container>
  <v-container v-else class="pt-0">
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <new-key
          :number-of-words="25"
          is-falcon
          @hide-tabs="hideTabs = true"
          @close="$emit('close')"
        />
      </v-window-item>
      <v-window-item :value="1">
        <import-key
          :number-of-words="25"
          button-text="Import"
          @mn="handleMnemonic"
        />
      </v-window-item>
    </v-window>
  </v-container>
  <v-dialog v-model="showPass" max-width="600" persistent>
    <password-create @close="checkPassword()" />
  </v-dialog>
  <password-confirm :visible="show" @close="handlePass" />
</template>

<script lang="ts" setup>
import { get, set } from "@/dbLute";
import Seed from "@/services/Seed";
import type { LuteAccount } from "@/types";
import { deepClone } from "@/utils";

const emit = defineEmits(["close"]);
const store = useAppStore();
const tab = ref(0);
const hideTabs = ref(false);
const showPass = ref(false);
const passwordSet = ref(true);
const show = ref(false);

const mnemonic = ref("");

function handleMnemonic(mn: string) {
  mnemonic.value = mn;
  show.value = true;
}

async function handlePass(success: boolean, pass: string) {
  show.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    try {
      const address = await Seed.storeFalconSeed(mnemonic.value, pass);
      const accts: LuteAccount[] = deepClone(store.accounts);
      if (accts.some((a) => a.addr === address.toString())) {
        emit("close");
        throw Error("Account Already Exists In Wallet");
      }
      accts.push({ addr: address.toString() });
      await set("app", "accounts", accts);
      await store.getCache();
      store.refresh++;
      store.setSnackbar("Account Imported", "success");
      emit("close");
    } catch (err: any) {
      console.error(err);
      store.setSnackbar(err.message, "error");
    }
  }
}

async function checkPassword() {
  showPass.value = false;
  passwordSet.value = !!(await get("app", "password"));
}

onBeforeMount(() => {
  checkPassword();
});
</script>
