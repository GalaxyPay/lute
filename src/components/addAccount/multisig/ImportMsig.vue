<template>
  <v-form ref="form" validate-on="submit" @submit.prevent="importApp()">
    <div class="dialog-body">
      <v-text-field
        v-model.number="appId"
        class="font-mono"
        label="App ID"
        density="comfortable"
        autofocus
        :rules="[required, validApp, isArc55, isMember]"
      />
    </div>
    <v-card-actions>
      <v-btn variant="flat" text="Import" type="submit" />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import Msig from "@/services/Msig";
import type { Arc55App } from "@/types";
import algosdk from "algosdk";

const store = useAppStore();
const form = ref();
const appId = ref();
let app: Arc55App;

const required = (v: string) => !!v || "Required";
const validApp = () => !!app?.info || "Invalid app ID";
const isArc55 = () =>
  app?.info.params?.globalState?.some(
    (gs) => new TextDecoder().decode(gs.key) === "arc55_admin"
  ) || "Not ARC-55";
const isMember = () =>
  store.signAcctInfo.some(
    (a) => a.addr === app?.arc55_admin || app?.addrs.includes(a.addr)
  ) || "Not a member";

const mparams = computed(() => ({
  version: 1,
  threshold: Number(app.arc55_threshold),
  addrs: app.addrs,
}));
const msigAddr = computed(() => {
  if (
    app.addrs.filter((addr: string) => algosdk.isValidAddress(addr)).length !==
    app.addrs.length
  )
    return "";
  return algosdk.multisigAddress(mparams.value).toString();
});

const emit = defineEmits(["add"]);

async function importApp() {
  const resp = await Msig.loadApp(appId.value, true);
  if (!resp) return;
  app = resp;
  const { valid } = await form.value.validate();
  if (!valid) return;
  emit("add", {
    addr: msigAddr.value,
    appId: appId.value,
    network: store.networkName,
  });
}
</script>
