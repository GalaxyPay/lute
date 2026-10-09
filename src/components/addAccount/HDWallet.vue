<template>
  <account-table
    v-if="seed"
    :accounts="accounts"
    :added="added"
    :preselect="preselect"
    :loading="loading"
    @get-addrs="getAddrs"
    @add-accounts="addAccounts"
  >
    <template #links>
      <v-btn size="small" text="Use a different seed" @click="reset" />
    </template>
  </account-table>
  <pick-seed
    v-else-if="!pending && rows.length"
    :rows="rows"
    @pick="pick"
    @seed="handleSeed"
    @removed="reloadRows"
  />
  <local-seed v-else-if="!pending" @seed="handleSeed" />
  <div v-else class="dialog-body text-center">
    <v-progress-circular indeterminate />
  </div>
  <keystore-unlock ref="unlocker" />
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script lang="ts" setup>
import { get, getAll, set } from "@/dbLute";
import HdWallet from "@/services/HdWallet";
import Keystore from "@/services/Keystore";
import Seed from "@/services/Seed";
import type {
  AccountSubs,
  KeystoreRecord,
  SeedData,
  SeedRow,
  Unlocker,
} from "@/types";
import { deepClone, isBadPassword, isCancelled } from "@/utils";

// Batches of derived accounts to scan for an unused one before giving up.
const MAX_SCAN = 3;

const emit = defineEmits(["close"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const showPass = ref(false);
const pending = ref(true);
const loading = ref(false);
const rows = ref<SeedRow[]>([]);
const accounts = ref<AccountSubs[]>([]);
const seed = shallowRef<Buffer>();
const seedId = ref<number>();
let picked: SeedRow;

const added = computed(() =>
  store.accounts.filter((a) => a.seedId === seedId.value).map((a) => a.addr)
);
const preselect = computed(() =>
  accounts.value.find((a) => !added.value.includes(a.address))
);

onBeforeMount(async () => {
  rows.value = await loadRows();
  // Most wallets have a single seed: go straight to its accounts.
  if (rows.value.length === 1) await pick(rows.value[0]);
  pending.value = false;
});

onBeforeUnmount(() => seed.value?.fill(0));

async function loadRows(): Promise<SeedRow[]> {
  const legacyAndPasskey = (await getAll("seeds")) as SeedData[];
  const keystore = ((await getAll("keystore")) as KeystoreRecord[]).filter(
    (r) => r.kind === "bip39"
  );
  return [
    ...legacyAndPasskey
      .filter((s) => s.credentialId)
      .map((s) => ({ id: s.id, credentialId: s.credentialId })),
    ...keystore.map((r) => ({
      id: Number(r.id.split(":")[1]),
      exportable: Keystore.isExportable(r.kind, r.form),
    })),
    ...legacyAndPasskey
      .filter((s) => s.data && !keystore.some((r) => r.id === `bip39:${s.id}`))
      .map((s) => ({ id: s.id, legacy: s })),
  ].sort((a, b) => a.id - b.id);
}

async function pick(row: SeedRow) {
  picked = row;
  try {
    if (picked.credentialId) {
      const { seed } = await Seed.getPasskeySeed(picked.credentialId);
      await handleSeed(picked.id, seed);
      return;
    }
    // Try the keystore first: the first password entry migrates 1.x seeds into it.
    const mk = await unlocker.value!.ensureMk();
    const id = `bip39:${picked.id}`;
    if (await get("keystore", id)) {
      const { rec, plaintext } = await Keystore.getSecret(mk, id);
      const seed = Buffer.from(
        Keystore.signingMaterial(rec.kind, rec.form, plaintext)
      );
      plaintext.fill(0);
      await handleSeed(picked.id, seed);
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
    await handleSeed(picked.id, seed);
  } catch (err: any) {
    store.setSnackbar(
      isBadPassword(err) ? "Incorrect Password" : err.message,
      "error"
    );
  }
}

async function getAddrs(startIndex: number = 0) {
  loading.value = true;
  try {
    const accts = await HdWallet.deriveAccts(seed.value!, startIndex);
    accounts.value = accounts.value.concat(accts);
    store.snackbar.display = false;
  } finally {
    loading.value = false;
  }
}

async function handleSeed(id: number, data: Buffer) {
  seedId.value = id;
  seed.value = data;
  accounts.value = [];
  try {
    await getAddrs(0);
    for (let i = 1; i < MAX_SCAN && !preselect.value; i++) {
      await getAddrs(accounts.value.length);
    }
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

async function reloadRows() {
  rows.value = await loadRows();
}

async function reset() {
  seed.value?.fill(0);
  seed.value = undefined;
  accounts.value = [];
  rows.value = await loadRows();
}

async function addAccounts(selected: AccountSubs[]) {
  seed.value?.fill(0);
  const add = selected
    .filter((a) => !store.accounts.some((acct) => acct.addr === a.address))
    .map((a) => ({
      addr: a.address,
      slot: accounts.value.findIndex((acct) => acct.address === a.address),
      seedId: seedId.value,
      xpub: a.xpub,
    }));
  const newVal = deepClone(store.accounts.concat(add));
  await set("app", "accounts", newVal);
  await store.getCache();
  store.refresh++;
  emit("close");
}
</script>
