<template>
  <div class="pl-12">Local Seed</div>
  <v-container>
    <no-password-notice />
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <new-key
          :number-of-words="24"
          @hide-tabs="hideTabs = true"
          @seed="(id, seed) => $emit('seed', id, seed)"
        />
      </v-window-item>
      <v-window-item :value="1">
        <input-bip39 @seed="(id, seed) => $emit('seed', id, seed)" />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
defineEmits(["seed"]);

const hideTabs = ref(false);
const tab = ref(0);
</script>
