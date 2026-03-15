<template>
  <v-dialog v-model="show" max-width="800" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Custom Networks
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="show = false" />
      </v-card-title>
      <v-card-subtitle class="text-wrap">
        Here you can add custom networks. If you specify a genesisID for a
        built-in network, your algod/indexer will override the built-in values
        and the name will be ignored.
      </v-card-subtitle>
      <v-container>
        <v-form ref="form" @submit.prevent="setCustomNetworks()">
          <v-textarea
            rows="16"
            v-model="custom"
            spellcheck="false"
            style="font-family: monospace"
            :rules="[tryParse]"
          />
          <v-card-actions>
            <v-btn text="Save" type="submit" />
            <v-btn text="Reset" @click="reset" />
          </v-card-actions>
        </v-form>
      </v-container>
      <v-card-subtitle>Example:</v-card-subtitle>
      <v-container>
        <pre style="overflow: auto; font-size: 0.75em">{{ example }}</pre>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { del, set } from "@/dbLute";
import type { Network } from "@/types";
import { mdiClose } from "@mdi/js";

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const show = computed({
  get() {
    return props.visible;
  },
  set(val) {
    if (!val) {
      store.refresh++;
      emit("close");
    }
  },
});

const store = useAppStore();

onBeforeMount(async () => {
  await getCustomNetworks();
});

const form = ref();
const custom = ref();

const example = `[{
  "name": "MainNet",
  "algod": {
    "url": "http://localhost",
    "port": "8081",
    "token": "yourtoken"
  },
  "genesisID": "mainnet-v1.0"
}]`;

function tryParse(str: string) {
  try {
    const json = JSON.parse(str);
    if (!Array.isArray(json)) throw Error("Must Be Array");
    json.forEach((x: Network) => {
      if (typeof x !== "object" || Array.isArray(x) || x === null) {
        throw Error("Must Be Array of Objects");
      }
      if (
        x.algod?.port == null ||
        x.algod?.token == null ||
        !x.algod?.url ||
        (x.indexer &&
          (x.indexer?.port == null ||
            x.indexer?.token == null ||
            !x.indexer?.url)) ||
        !x.genesisID
      ) {
        throw Error("Invalid Schema");
      }
    });
  } catch (err: any) {
    return err.message ?? "Invalid JSON";
  }
  return true;
}

async function getCustomNetworks() {
  await store.getCache();
  custom.value = JSON.stringify(store.customNetworks, null, 2);
}

async function setCustomNetworks() {
  const { valid } = await form.value.validate();
  if (!valid) return;

  await set("app", "customNetworks", JSON.parse(custom.value));
  await getCustomNetworks();
  store.setSnackbar("Saved", "success");
  show.value = false;
}

async function reset() {
  await del("app", "customNetworks");
  await getCustomNetworks();
  store.setSnackbar("Reset", "success");
  show.value = false;
}
</script>
