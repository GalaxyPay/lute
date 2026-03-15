<template>
  <v-container v-if="!newSeed && seeds.length">
    <div class="pl-6">Existing Seeds</div>
    <v-container class="pt-0">
      <v-data-table
        :items="seeds"
        :headers="headers"
        class="no-select"
        items-per-page="-1"
        @click:row="getSeed"
        hover
      >
        <template #[`item.type`]="{ item }">
          {{ item.credentialId ? "Passkey" : "Local" }}
        </template>
        <template #bottom />
      </v-data-table>
    </v-container>
    <v-container class="text-center">
      <v-row>
        <v-col>
          <v-btn
            :prepend-icon="mdiPlusCircle"
            text="Add Seed"
            @click="newSeed = true"
          />
        </v-col>
      </v-row>
    </v-container>
  </v-container>
  <v-container v-else-if="!type" class="pt-0">
    <div class="pl-6">Choose a type of Seed</div>
    <v-container>
      <v-card variant="outlined" color="primary" class="pointer">
        <v-container
          :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
          @click="type = 'local'"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiOpenInApp" />
            </v-col>
            <v-col>
              Local
              <div class="text-grey">
                The seed is generated and stored encrypted in the browser
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-container>
    <v-container>
      <v-card variant="outlined" color="primary" class="pointer">
        <v-container
          :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
          @click="type = 'passkey'"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiDevices" />
            </v-col>
            <v-col>
              Passkey
              <div class="text-grey">
                The seed is generated and stored on an authenticator device
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-container>
  </v-container>
  <local-seed
    v-else-if="type === 'local'"
    @seed="(id, seed) => $emit('seed', id, seed)"
  />
  <passkey
    v-else-if="type === 'passkey'"
    @seed="(id, seed) => $emit('seed', id, seed)"
  />
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script setup lang="ts">
import { getAll } from "@/dbLute";
import Seed from "@/services/Seed";
import type { SeedData } from "@/types";
import { mdiDevices, mdiOpenInApp, mdiPlusCircle } from "@mdi/js";
import { useTheme } from "vuetify";

const emit = defineEmits(["close", "seed"]);

const store = useAppStore();
const theme = useTheme();
const showPass = ref(false);
let seedId: number;
const newSeed = ref(false);
const type = ref();
const seeds = ref<SeedData[]>([]);
const headers: any[] = [
  { title: "#", key: "id", sortable: false },
  { title: "Type", key: "type", sortable: false },
];

onBeforeMount(async () => {
  seeds.value = await getAll("seeds");
});

let seedData: SeedData;
async function getSeed(_event: any, row: any) {
  seedData = row.item;
  seedId = seedData.id;
  if (seedData.credentialId) {
    const { seed } = await Seed.getPasskeySeed(seedData.credentialId);
    emit("seed", seedId, seed);
  } else {
    showPass.value = true;
  }
}

async function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    const seed = await Seed.decryptSeed(pass, seedData);
    emit("seed", seedId, seed);
  }
}
</script>
