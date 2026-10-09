<template>
  <v-dialog v-model="show" max-width="620" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Custom Networks
        <v-spacer />
        <v-icon :icon="mdiClose" @click="show = false" />
      </v-card-title>
      <v-card-text class="pb-0 text-muted text-body-2">
        Here you can add custom networks. If you specify a genesisID for a
        built-in network, your algod/indexer will override the built-in values
        and the name will be ignored.
      </v-card-text>
      <v-form ref="form" @submit.prevent="setCustomNetworks()">
        <v-card-text class="pb-0">
          <v-textarea
            class="font-mono"
            rows="16"
            v-model="custom"
            spellcheck="false"
            :rules="[tryParse]"
          />
        </v-card-text>
        <div class="d-flex ga-2 px-6 pt-1 pb-4">
          <v-btn variant="flat" text="Save" type="submit" />
          <v-btn text="Reset" color="text-body" @click="reset" />
        </div>
      </v-form>
      <div class="example">
        <div class="text-muted text-caption mb-2">Example:</div>
        <pre>{{ example }}</pre>
      </div>
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

<style scoped>
.example {
  padding: 18px 24px 22px;
  border-top: 1px solid rgb(var(--v-theme-border));
}
.example pre {
  font-size: 11.5px;
  line-height: 1.6;
  color: rgb(var(--v-theme-text-muted));
}
</style>
