<template>
  <password-confirm :visible="show" @close="onClose" />
</template>

<script lang="ts" setup>
import Keystore from "@/services/Keystore";
import type { MasterKey } from "@/types";
import { isBadPassword, needsPassword, UserCancelled } from "@/utils/keys";

const store = useAppStore();
const show = ref(false);

let pending:
  | {
      fresh: boolean;
      resolve: (mk: MasterKey) => void;
      reject: (err: unknown) => void;
    }
  | undefined;

async function ensureMk(opts: { fresh?: boolean } = {}): Promise<MasterKey> {
  // Device mode has nothing to type.
  if ((await Keystore.mode()) === "device") return await Keystore.getMk();
  if (!opts.fresh) {
    try {
      return await Keystore.getMk();
    } catch (err) {
      if (!needsPassword(err)) throw err;
    }
  }
  pending?.reject(new UserCancelled());
  return await new Promise<MasterKey>((resolve, reject) => {
    pending = { fresh: !!opts.fresh, resolve, reject };
    show.value = true;
  });
}

async function onClose(success: boolean, pass?: string) {
  show.value = false;
  const p = pending;
  if (!p) return;
  if (!success || !pass) {
    pending = undefined;
    p.reject(new UserCancelled());
    return;
  }
  try {
    // A fresh request still goes through unlockWithPassword when there is no
    // header yet: the first password entry is what creates it.
    const mk =
      p.fresh && (await Keystore.header())
        ? await Keystore.unwrap(pass)
        : await Keystore.unlockWithPassword(pass);
    pending = undefined;
    // The first entry may have migrated 1.x seeds into the keystore.
    await store.getCache();
    p.resolve(mk);
  } catch (err) {
    if (isBadPassword(err)) {
      store.setSnackbar("Incorrect Password", "error");
      show.value = true;
      return;
    }
    pending = undefined;
    p.reject(err);
  }
}

defineExpose({ ensureMk });
</script>
