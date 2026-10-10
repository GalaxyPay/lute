<template>
  <div class="sync-page">
    <sync-session
      v-if="ready"
      :side="store.isWeb ? 'web' : 'ext'"
      role="receive"
      :tab-id="tabId"
      :token="token"
      @close="done()"
      @done="done()"
    />
  </div>
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

<style scoped>
.sync-page {
  display: flex;
  min-height: calc(
    100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px)
  );
}
.sync-page > :deep(.v-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  background: transparent;
}
.sync-page :deep(.v-card-title) {
  margin-top: auto;
  justify-content: center;
  font-size: 19px;
  font-weight: 500;
  padding: 24px 20px 8px;
}
.sync-page :deep(.v-card-text) {
  flex: none;
  padding: 0 20px 14px;
  text-align: center;
  font-size: 13.5px;
  line-height: 1.55;
  color: rgb(var(--v-theme-text-body));
}
.sync-page :deep(.v-alert) {
  text-align: start;
}
.sync-page :deep(.card-footer) {
  margin-top: auto;
  padding: 14px 16px;
}
.sync-page :deep(.card-footer .v-btn) {
  flex: 1;
  --v-btn-height: 40px;
  font-size: 14px;
}
.sync-page :deep(.card-footer .v-btn--variant-flat) {
  flex: 2;
}
</style>
