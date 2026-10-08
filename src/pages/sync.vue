<template>
  <v-container class="pt-0">
    <sync-session
      v-if="ready"
      :side="store.isWeb ? 'web' : 'ext'"
      role="receive"
      :tab-id="tabId"
      :token="token"
      @close="done()"
      @done="done()"
    />
  </v-container>
</template>

<script lang="ts" setup>
// Receiving side of a sync. The extension gets the sending tab's id (side
// panel, or a popup fallback); the web app gets a one-time token.
import { resetSidePanel } from "@/utils";
import { useRoute, useRouter } from "vue-router";

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const ready = ref(false);
let tabId: number | undefined;
let token: string | undefined;
const inPanel = !store.isWeb && !!route.query.panel;

onMounted(async () => {
  if (store.isWeb) {
    token = route.query.token?.toString();
    // Out of the address bar at once; it is single use either way.
    if (token) await router.replace({ query: {} });
    ready.value = !!token;
  } else {
    const raw = Number(route.query.tabId);
    tabId = Number.isInteger(raw) ? raw : undefined;
    // The background resets the panel to the wallet when this disconnects,
    // so closing the panel mid-sync does not leave it on a dead sync page.
    if (inPanel) browser.runtime.connect({ name: "luteSidepanel" });
    ready.value = tabId != null;
  }
});

async function done() {
  if (inPanel) await resetSidePanel();
  // The extension also closes this window when the web app is the receiver,
  // in case the browser does not let a page close a window it did not open.
  window.close();
}
</script>
