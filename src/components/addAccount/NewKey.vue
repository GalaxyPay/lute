<template>
  <div v-show="page === 0">
    <div class="dialog-body d-flex flex-column ga-4">
      <p class="text-text-body">
        Write this mnemonic down and keep it somewhere secure. It is the only
        way to recover your {{ isBip39 ? "wallet" : "account" }} if this
        browser's data is lost.
      </p>
      <div v-if="!isBip39">
        <div class="d-flex align-center justify-space-between">
          <span class="field-label">Address:</span>
          <v-btn
            size="small"
            class="mr-n3"
            :prepend-icon="mdiContentCopy"
            text="Copy"
            @click="copyToClipboard(addr.toString())"
          />
        </div>
        <div class="font-mono word-break">{{ addr }}</div>
      </div>
      <mnemonic-display :words="mnemonicArray" />
      <p class="text-muted text-body-2">
        Make sure you have the entire
        <b class="text-high-emphasis">{{ props.numberOfWords }}-word mnemonic</b
        >, or you will
        <b class="text-high-emphasis"
          >lose access to this {{ isBip39 ? "wallet" : "account" }} forever</b
        >
        if this browser's data is lost.
      </p>
    </div>
    <v-card-actions>
      <v-btn
        variant="flat"
        text="Next"
        @click="
          page = 1;
          $emit('hideTabs');
        "
      />
    </v-card-actions>
  </div>
  <v-form
    v-show="page === 1"
    ref="form"
    @submit.prevent="submit()"
    validate-on="submit"
  >
    <div class="word-check">
      <p class="text-text-body">
        What is word number <b class="text-high-emphasis">{{ challenge }}</b
        >?
      </p>
      <v-text-field
        density="compact"
        class="word-check-field"
        :rules="[match]"
      />
    </div>
    <v-card-actions>
      <v-btn variant="flat" text="Create" type="submit" :loading="saving" />
    </v-card-actions>
  </v-form>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import type { LuteAccount, Unlocker } from "@/types";
import { copyToClipboard, getFalconKey, isCancelled } from "@/utils";
import { mdiContentCopy } from "@mdi/js";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import algosdk from "algosdk";

const props = defineProps({
  numberOfWords: { type: Number, required: true },
  isFalcon: { type: Boolean, default: false },
  convertion: { type: String },
});

const emit = defineEmits(["close", "hideTabs", "seed"]);
const store = useAppStore();
const unlocker = ref<Unlocker>();
const saving = ref(false);
const isBip39 = computed(() => props.numberOfWords === 24);
const acct = props.convertion
  ? algosdk.mnemonicToSecretKey(props.convertion)
  : algosdk.generateAccount();
const mn = isBip39.value
  ? bip39.generateMnemonic(wordlist, 256)
  : algosdk.secretKeyToMnemonic(acct.sk);
const falconKey = props.isFalcon ? getFalconKey(mn) : undefined;
const addr = falconKey?.address || acct.addr;
const mnemonicArray = mn.split(" ");
const page = ref(0);
const challenge = Math.floor(Math.random() * props.numberOfWords) + 1;
const form = ref();
const match = (v: string) => v === mnemonicArray[challenge - 1] || "Incorrect";

async function submit() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    saving.value = true;
    const mk = await unlocker.value!.ensureMk();
    if (isBip39.value) {
      const id = await Keystore.storeMnemonic(mk, "bip39", mn);
      const seed = Buffer.from(bip39.mnemonicToSeedSync(mn));
      emit("seed", Number(id.split(":")[1]), seed);
      return;
    }
    const kind = props.isFalcon ? "falcon25" : "algo25";
    const address = addr.toString();
    const newAcct: LuteAccount = falconKey
      ? { addr: address, falconPk: falconKey.publicKey.toBase64() }
      : { addr: address };
    await Keystore.storeMnemonic(mk, kind, mn, {
      id: `${kind}:${address}`,
      accounts: (current: LuteAccount[]) =>
        current.some((a) => a.addr === address)
          ? current
          : [...current, newAcct],
    });
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Account Created", "success");
    emit("close");
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.field-label {
  font-size: 12px;
  color: rgb(var(--v-theme-text-muted));
}
.word-break {
  word-break: break-all;
}
.word-check {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 24px 30px;
}
.word-check-field {
  width: 220px;
  flex: none;
}
.word-check-field :deep(input) {
  font-family: var(--font-mono);
}
</style>
