<template>
  <v-container class="pt-0">
    <v-tabs v-if="!hideTabs" v-model="tab" color="primary">
      <v-tab text="NEW" />
      <v-tab text="IMPORT" />
      <v-tab v-if="store.networkName === 'LocalNet'" text="KMD" />
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item :value="0">
        <new-mnemonic @hide-tabs="hideTabs = true" @close="$emit('close')" />
      </v-window-item>
      <v-window-item :value="1">
        <input-mnemonic
          :number-of-words="25"
          button-text="Import"
          @close="$emit('close')"
        />
      </v-window-item>
      <v-window-item v-if="store.networkName === 'LocalNet'" :value="2">
        <import-kmd @close="$emit('close')" />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
defineEmits(["close"]);
const store = useAppStore();
const tab = ref(0);
const hideTabs = ref(false);
</script>
