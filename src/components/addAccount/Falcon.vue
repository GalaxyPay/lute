<template>
  <v-container class="pt-0">
    <no-password-notice />
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
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import type { LuteAccount, Unlocker } from "@/types";
import { getFalconKey, isCancelled } from "@/utils";

const emit = defineEmits(["close"]);
const store = useAppStore();
const tab = ref(0);
const hideTabs = ref(false);
const unlocker = ref<Unlocker>();

async function handleMnemonic(mn: string) {
  try {
    const key = getFalconKey(mn);
    const address = key.address.toString();
    const falconPk = key.publicKey.toBase64();
    if (store.accounts.some((a) => a.addr === address)) {
      emit("close");
      throw Error(
        "Account already in wallet. To re-enter its mnemonic, use Upgrade Account from its menu."
      );
    }
    const mk = await unlocker.value!.ensureMk();
    await Keystore.storeMnemonic(mk, "falcon25", mn, {
      id: `falcon25:${address}`,
      accounts: (current: LuteAccount[]) =>
        current.some((a) => a.addr === address)
          ? current
          : [...current, { addr: address, falconPk }],
    });
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Account Imported", "success");
    emit("close");
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
