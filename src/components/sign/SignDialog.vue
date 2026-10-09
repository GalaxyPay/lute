<template>
  <v-dialog v-model="show" max-width="500" height="750" persistent>
    <v-card color="background">
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
import { useDisplay } from "vuetify";

defineProps({ isOptions: { type: Boolean, default: false } });

const { mdAndUp } = useDisplay();
const store = useAppStore();

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
