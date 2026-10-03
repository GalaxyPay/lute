<template>
  <v-dialog :model-value="!!mode" max-width="560" persistent>
    <v-card v-if="mode" :loading="busy" :disabled="busy">
      <v-card-title class="d-flex">
        {{ mode === "backup" ? "Backup Wallet" : "Restore Backup" }}
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="close()" />
      </v-card-title>
      <template v-if="!result">
        <v-card-text v-if="mode === 'backup'" class="pb-0">
          Saves your accounts and the keys stored in this browser to a file,
          encrypted with the password you choose here. Anyone who gets the file
          can try to guess that password offline, so make it a strong one.
        </v-card-text>
        <v-card-text v-else class="pb-0">
          Adds the accounts in a Lute backup file to this wallet. Accounts that
          are already here are left as they are.
        </v-card-text>
        <v-container>
          <v-form ref="form" @submit.prevent="submit()" validate-on="submit">
            <v-file-input
              v-if="mode === 'restore'"
              v-model="file"
              label="Backup file"
              accept=".json,application/json"
              density="comfortable"
              :rules="[required]"
            />
            <v-text-field
              v-model="pass1"
              label="Backup Password"
              type="password"
              autocomplete="new-password"
              density="comfortable"
              :rules="[required]"
            />
            <v-text-field
              v-if="mode === 'backup'"
              v-model="pass2"
              label="Confirm Backup Password"
              type="password"
              autocomplete="new-password"
              density="comfortable"
              :rules="[required, match]"
            />
            <v-card-actions>
              <v-spacer />
              <v-btn
                :text="mode === 'backup' ? 'Save File' : 'Restore'"
                type="submit"
                :loading="busy"
              />
            </v-card-actions>
          </v-form>
        </v-container>
      </template>
      <template v-else>
        <v-card-text>{{ result.summary }}</v-card-text>
        <v-card-text v-if="result.skipped.length" class="pt-0">
          <div class="pb-1">Not included:</div>
          <div
            v-for="s in result.skipped"
            :key="s.addr"
            style="font-size: 0.8em"
          >
            <span style="font-family: monospace">{{ formatAddr(s.addr) }}</span>
            <span class="text-grey"> {{ s.reason }}</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text="Close" @click="close()" />
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import Backup, { type Skipped } from "@/services/Backup";
import type { Unlocker } from "@/types";
import { formatAddr, isBadPassword, isCancelled } from "@/utils";
import { mdiClose } from "@mdi/js";

const props = defineProps<{ mode?: "backup" | "restore" }>();
const emit = defineEmits(["close"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const form = ref();
const file = ref<File | File[]>();
const pass1 = ref<string>();
const pass2 = ref<string>();
const busy = ref(false);
const result = ref<{ summary: string; skipped: Skipped[] }>();
const required = (v: unknown) => !!v || "Required";
const match = (v: string) => v === pass1.value || "Mismatch";

watch(
  () => props.mode,
  () => {
    file.value = pass1.value = pass2.value = result.value = undefined;
  }
);

function download(text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lute-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function submit() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  busy.value = true;
  try {
    if (props.mode === "backup") {
      // Always the typed password: the file carries every key in the wallet.
      const mk = await unlocker.value!.ensureMk({ fresh: true });
      const { text, skipped } = await Backup.exportBundle(mk, pass1.value!, {
        from: store.isWeb ? "web" : "extension",
        appVersion: __APP_VERSION__,
      });
      download(text);
      result.value = { summary: "Backup saved.", skipped };
    } else {
      const picked = Array.isArray(file.value) ? file.value[0] : file.value;
      if (!picked) return;
      const payload = await Backup.readBundle(await picked.text(), pass1.value!);
      const mk = await unlocker.value!.ensureMk();
      const { added, skipped } = await Backup.restoreBundle(mk, payload);
      await store.getCache();
      store.refresh++;
      result.value = {
        summary: `${added} account${added === 1 ? "" : "s"} added.`,
        skipped,
      };
    }
  } catch (err: any) {
    if (isCancelled(err)) return;
    console.error(err);
    store.setSnackbar(
      isBadPassword(err) ? "Incorrect Backup Password" : err.message,
      "error"
    );
  } finally {
    busy.value = false;
  }
}

function close() {
  pass1.value = pass2.value = undefined;
  emit("close");
}
</script>
