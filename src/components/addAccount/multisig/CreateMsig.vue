<template>
  <v-form ref="form" @submit.prevent="createApp()">
    <div class="dialog-body d-flex flex-column ga-1">
      <v-select
        v-model="creator"
        label="Creator"
        placeholder="Choose an account..."
        density="comfortable"
        persistent-placeholder
        :items="store.signAcctInfo"
        :item-title="
          (item: AccountInfo) => item.name || item.ns?.name || item.title
        "
        item-value="addr"
        :rules="[required]"
      />
      <div class="d-flex align-start ga-3">
        <v-select
          v-model.number="threshold"
          label="Threshold"
          :items="thresholdOptions"
          density="comfortable"
          hint="Number of signatures needed"
          persistent-hint
        />
        <span class="of-label">of</span>
        <v-select
          v-model.number="numAddrs"
          label="Number of addresses"
          :items="numAddrsOptions"
          density="comfortable"
          @update:model-value="addrs.splice(numAddrs)"
        />
      </div>
      <v-text-field
        v-for="n in numAddrs"
        :key="n"
        class="font-mono"
        v-model="addrs[n - 1]"
        :label="`Address ${n}`"
        density="comfortable"
        :rules="[required, validAddress]"
      />
      <v-text-field
        class="font-mono readonly-field"
        :model-value="msigAddr"
        :label="'Multi-sig address (calculated)'"
        readonly
        density="comfortable"
      />
    </div>
    <v-card-actions>
      <v-btn variant="flat" text="Create" type="submit" />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import { MsigAppFactory } from "@/clients/MsigApp.client";
import Algo from "@/services/Algo";
import type { AccountInfo } from "@/types";
import { luteSigner } from "@/utils/signers";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";

const store = useAppStore();
const form = ref();
const creator = ref();
const numAddrs = ref(2);
const threshold = ref(1);
const appId = ref();

const numAddrsOptions = computed(() => Array.from(Array(30), (_, i) => i + 1));

const thresholdOptions = computed(() =>
  Array.from(Array(numAddrs.value), (_, i) => i + 1)
);

const required = (v: string) => !!v || "Required";
const validAddress = (v: string) =>
  algosdk.isValidAddress(v) || "Invalid address";

const addrs = ref([]);
const mparams = computed(() => ({
  version: 1,
  threshold: threshold.value,
  addrs: addrs.value,
}));
const msigAddr = computed(() => {
  if (
    addrs.value.filter((addr) => algosdk.isValidAddress(addr)).length !==
    numAddrs.value
  )
    return "";
  return algosdk.multisigAddress(mparams.value).toString();
});

const emit = defineEmits(["add"]);

async function createApp() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
    algorand.setDefaultSigner(luteSigner);
    algorand.setDefaultValidityWindow(1000);
    const factory = new MsigAppFactory({
      defaultSender: creator.value,
      algorand,
    });
    const { result } = await factory.send.create.deploy({
      args: {
        admin: creator.value,
        threshold: threshold.value,
        addresses: addrs.value,
      },
    });
    appId.value = result.appId;
    emit("add", {
      addr: msigAddr.value,
      appId: appId.value,
      network: store.networkName,
    });
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}
</script>

<style scoped>
.of-label {
  padding-top: 32px;
  font-size: 13px;
  color: rgb(var(--v-theme-text-dim));
}
.readonly-field :deep(.v-field) {
  background: rgb(var(--v-theme-surface-variant));
  color: rgb(var(--v-theme-text-dim));
}
</style>
