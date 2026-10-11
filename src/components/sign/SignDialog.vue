<template>
  <v-dialog
    v-model="show"
    max-width="500"
    height="750"
    persistent
    :content-props="{ style: contentStyle }"
  >
    <v-card color="background" class="d-flex flex-column">
      <div class="d-flex align-center ga-3 px-4 pt-4 pb-2">
        <lute-logo
          :color="store.theme === 'gold' ? 'url(#gradient)' : 'currentColor'"
          :width="80"
        />
        <v-chip
          v-show="store.networkName !== 'MainNet'"
          class="net-chip"
          color="error"
          :text="store.networkName"
        />
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          aria-label="Close"
          @click="close()"
        />
      </div>
      <SignView />
    </v-card>
    <Snackbar
      v-if="store.showDialogSnack"
      :style="
        store.isWeb
          ? mdAndUp && 'margin-left: -232px'
          : !isOptions && 'margin-bottom: -48px'
      "
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { mdiClose } from "@mdi/js";
import { useDisplay, useLayout } from "vuetify";

defineProps({ isOptions: { type: Boolean, default: false } });

const { mdAndUp } = useDisplay();
const store = useAppStore();
const { mainRect } = useLayout();

// The app-level "Awaiting Signatures..." snackbar sits above the layout's
// bottom items (e.g. the extension's bottom nav), which the dialog ignores, so
// lift the dialog clear of it on short viewports.
const SNACK_SPACE = 56;
const contentStyle = computed(() => {
  if (store.showDialogSnack || !store.snackbar.display) return undefined;
  const bottom = mainRect.value.bottom + SNACK_SPACE;
  return {
    marginBottom: `${bottom}px`,
    maxHeight: `calc(100% - 24px - ${bottom}px)`,
  };
});

const show = computed({
  get() {
    return !!store.luteTxns;
  },
  set(val) {
    if (!val) {
      store.luteTxns = undefined;
    }
  },
});

function close() {
  const message = { action: "close", debug: store.debug };
  window.dispatchEvent(new CustomEvent("modal-signer", { detail: message }));
  store.luteTxns = undefined;
}
</script>
