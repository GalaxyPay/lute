<template>
  <v-dialog :model-value="!!account" max-width="700" persistent>
    <v-card v-if="account" :loading="busy" :disabled="busy">
      <v-card-title class="d-flex">
        Upgrade Account
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="emit('close')" />
      </v-card-title>
      <v-card-text class="pb-0">
        This account was added before Lute could show mnemonics, so only a
        one-way form of its key is stored. Re-enter its
        {{ words }}-word mnemonic to store it in a form you can export later.
        <template v-if="seedAccounts.length > 1">
          All {{ seedAccounts.length }} accounts on this seed are upgraded
          together.
        </template>
        Nothing changes on chain.
      </v-card-text>
      <v-container class="pt-0">
        <import-key
          :key="account.addr"
          :number-of-words="words"
          button-text="Upgrade"
          @mn="upgrade"
        />
      </v-container>
    </v-card>
  </v-dialog>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import { isHd, secretKind } from "@/services/accountSecret";
import Keystore from "@/services/Keystore";
import type { AccountInfo, LuteAccount, Unlocker } from "@/types";
import { isCancelled } from "@/utils";
import { mdiClose } from "@mdi/js";

const props = defineProps<{ account?: AccountInfo }>();
const emit = defineEmits(["close"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const busy = ref(false);
const kind = computed(() =>
  props.account ? secretKind(props.account, store) : undefined
);
const words = computed(() => (kind.value === "bip39" ? 24 : 25));

/** Every stored account the mnemonic has to match. */
const seedAccounts = computed<LuteAccount[]>(() => {
  const acct = props.account;
  if (!acct) return [];
  if (isHd(acct))
    return store.accounts.filter((a) => a.seedId === acct.seedId && isHd(a));
  return store.accounts.filter((a) => a.addr === acct.addr);
});

async function upgrade(mn: string) {
  const acct = props.account;
  if (!acct || !kind.value) return;
  busy.value = true;
  try {
    if (!(await Keystore.mnemonicMatches(kind.value, mn, seedAccounts.value))) {
      store.setSnackbar("This mnemonic does not match this account", "error");
      return;
    }
    const mk = await unlocker.value!.ensureMk();
    await Keystore.upgradeSecret(mk, kind.value, mn, {
      seedId: acct.seedId,
      addr: acct.addr,
    });
    await store.getCache();
    store.setSnackbar("Account Upgraded", "success");
    emit("close");
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    busy.value = false;
  }
}
</script>
