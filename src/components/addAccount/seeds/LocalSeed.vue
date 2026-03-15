<template>
  <div class="pl-12">Local Seed</div>
  <v-container v-if="!passwordSet" class="px-1 text-center">
    <div>You must set a password in order to use this feature.</div>
    <v-btn class="my-4" text="Set Password" @click="showPass = true" />
  </v-container>
  <v-container v-else>
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <new-bip39
          @hide-tabs="hideTabs = true"
          @seed="(id, seed) => $emit('seed', id, seed)"
        />
      </v-window-item>
      <v-window-item :value="1">
        <input-bip39 @seed="(id, seed) => $emit('seed', id, seed)" />
      </v-window-item>
    </v-window>
  </v-container>
  <v-dialog v-model="showPass" max-width="600" persistent>
    <password-create @close="checkPassword()" />
  </v-dialog>
</template>

<script lang="ts" setup>
import { get } from "@/dbLute";

defineEmits(["seed"]);

const hideTabs = ref(false);
const showPass = ref(false);
const passwordSet = ref();
const tab = ref(0);

async function checkPassword() {
  showPass.value = false;
  passwordSet.value = !!(await get("app", "password"));
}

onBeforeMount(() => {
  checkPassword();
});
</script>
