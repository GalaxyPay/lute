<template>
  <v-app-bar flat color="background" height="56" class="app-bar">
    <v-app-bar-title class="ml-4" @click="store.drawer = !store.drawer">
      <div class="d-flex align-center ga-3">
        <lute-logo
          :color="store.theme === 'gold' ? 'url(#gradient)' : 'currentColor'"
          :width="86"
        />
        <v-chip
          v-show="store.networkName !== 'MainNet'"
          class="net-chip"
          color="error"
          :text="store.networkName"
        />
      </div>
    </v-app-bar-title>
    <template v-if="!store.isWeb">
      <v-btn
        :icon="mdiClose"
        variant="text"
        size="small"
        class="mr-2"
        aria-label="Close"
        @click.prevent="close()"
      />
    </template>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { mdiClose } from "@mdi/js";

const store = useAppStore();

function close() {
  window.close();
}
</script>
