<template>
  <pick-seed @seed="handleSeed" />
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import Falcon from "@/services/Falcon";
import type { LuteAccount } from "@/types";
import { deepClone } from "@/utils";

const emit = defineEmits(["close"]);
const store = useAppStore();

async function handleSeed(id: number, data: Buffer) {
  emit("close");
  try {
    const { addr, ...falcon } = await Falcon.algoAccount(data);
    const accts: LuteAccount[] = deepClone(store.accounts);
    if (accts.some((a) => a.addr === addr)) {
      emit("close");
      throw Error("Account Already Exists In Wallet");
    }
    accts.push({ addr, falcon, seedId: id });
    await set("app", "accounts", accts);
    await store.getCache();
    store.refresh++;
    store.setSnackbar("Falcon Account Added", "success");
    emit("close");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
