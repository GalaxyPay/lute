<template>
  <v-app-bar flat color="background">
    <v-app-bar-title @click="store.drawer = !store.drawer">
      <lute-logo
        :color="theme.name.value === 'gold' ? 'url(#gradient)' : 'currentColor'"
        :width="120"
        class="mb-n1 mr-2"
      />
      <v-chip
        v-show="store.networkName !== 'MainNet'"
        size="small"
        color="error"
        :text="store.networkName"
      />
    </v-app-bar-title>
    <template v-if="!store.isWeb">
      <v-icon :icon="mdiClose" class="mr-4" @click.prevent="close()" />
    </template>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { mdiClose } from "@mdi/js";
import { useTheme } from "vuetify";
const store = useAppStore();
const theme = useTheme();

function close() {
  window.close();
}
</script>
