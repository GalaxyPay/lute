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
        <template #[`item.exportable`]="{ item }">
          <v-chip
            v-if="!item.credentialId && !item.exportable"
            text="Legacy"
            size="x-small"
          />
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
          :class="store.theme == 'light' ? 'text-black' : 'text-white'"
          @click="type = 'local'"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiOpenInApp" />
            </v-col>
            <v-col>
              Local
              <div class="text-grey">
                The seed is stored encrypted in the browser
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-card>
    </v-container>
    <v-container>
      <v-card variant="outlined" color="primary" class="pointer">
        <v-container
          :class="store.theme == 'light' ? 'text-black' : 'text-white'"
          @click="type = 'passkey'"
        >
          <v-row>
            <v-col align-self="center" cols="auto">
              <v-icon :icon="mdiDevices" />
            </v-col>
            <v-col>
              Passkey
              <div class="text-grey">
                The seed is stored on an authenticator device
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
  <keystore-unlock ref="unlocker" />
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script setup lang="ts">
import { get, getAll } from "@/dbLute";
import Keystore from "@/services/Keystore";
import Seed from "@/services/Seed";
import type {
  KeystoreRecord,
  SeedData,
  Unlocker,
} from "@/types";
import { isBadPassword, isCancelled } from "@/utils";
import { mdiDevices, mdiOpenInApp, mdiPlusCircle } from "@mdi/js";

interface SeedRow {
  id: number;
  credentialId?: string;
  exportable?: boolean;
  // @legacy-read A 1.x seed still under its own password.
  legacy?: SeedData;
}

const emit = defineEmits(["close", "seed"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const showPass = ref(false);
const newSeed = ref(false);
const type = ref();
const seeds = ref<SeedRow[]>([]);
const headers: any[] = [
  { title: "#", key: "id", sortable: false },
  { title: "Type", key: "type", sortable: false },
  { key: "exportable", sortable: false, align: "end" },
];

onBeforeMount(async () => {
  const legacyAndPasskey = (await getAll("seeds")) as SeedData[];
  const keystore = ((await getAll("keystore")) as KeystoreRecord[]).filter(
    (r) => r.kind === "bip39"
  );
  seeds.value = [
    ...legacyAndPasskey
      .filter((s) => s.credentialId)
      .map((s) => ({ id: s.id, credentialId: s.credentialId })),
    ...keystore.map((r) => ({
      id: Number(r.id.split(":")[1]),
      exportable: Keystore.isExportable(r.kind, r.form),
    })),
    ...legacyAndPasskey
      .filter(
        (s) => s.data && !keystore.some((r) => r.id === `bip39:${s.id}`)
      )
      .map((s) => ({ id: s.id, legacy: s })),
  ].sort((a, b) => a.id - b.id);
});

let picked: SeedRow;
async function getSeed(_event: any, row: { item: SeedRow }) {
  picked = row.item;
  try {
    if (picked.credentialId) {
      const { seed } = await Seed.getPasskeySeed(picked.credentialId);
      emit("seed", picked.id, seed);
      return;
    }
    // The first password entry migrates 1.x seeds into the keystore, so a
    // legacy row is tried there first.
    const mk = await unlocker.value!.ensureMk();
    const id = `bip39:${picked.id}`;
    if (await get("keystore", id)) {
      const { rec, plaintext } = await Keystore.getSecret(mk, id);
      const seed = Buffer.from(
        Keystore.signingMaterial(rec.kind, rec.form, plaintext)
      );
      plaintext.fill(0);
      emit("seed", picked.id, seed);
      return;
    }
    if (!picked.legacy) throw Error("Invalid Seed");
    // Still in its old store: it is under a different password.
    showPass.value = true;
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

async function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) return;
  try {
    const seed = await Seed.decryptSeed(pass, picked.legacy!);
    emit("seed", picked.id, seed);
  } catch (err: any) {
    store.setSnackbar(
      isBadPassword(err) ? "Incorrect Password" : err.message,
      "error"
    );
  }
}
</script>
