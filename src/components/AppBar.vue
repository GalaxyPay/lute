<template>
  <v-app-bar flat color="background" height="56" class="app-bar">
    <v-app-bar-nav-icon
      v-if="store.isWeb && !route?.meta.modal"
      color="text-body"
      class="ml-1"
      @click="store.drawer = !store.drawer"
    />
    <v-app-bar-title
      :class="store.isWeb && !route?.meta.modal ? 'ml-1' : 'ml-4'"
      @click="store.drawer = !store.drawer"
    >
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
import { useRoute } from "vue-router";

const store = useAppStore();
// The extension options page has no router.
const route = store.isWeb ? useRoute() : undefined;

function close() {
  window.close();
}
</script>
