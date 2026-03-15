<template>
  <v-dialog v-model="show" max-width="500" height="750" persistent>
    <v-card color="background" border="sm" rounded="lg">
      <v-container class="d-flex">
        <v-app-bar-title>
          <lute-logo
            :color="
              theme.name.value === 'gold' ? 'url(#gradient)' : 'currentColor'
            "
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
        <v-icon :icon="mdiClose" class="ma-1" @click="close()" />
      </v-container>
      <SignView />
    </v-card>
    <Snackbar
      v-if="store.showDialogSnack"
      :style="
        store.isWeb
          ? mdAndUp && 'margin-left: -256px'
          : !isOptions && 'margin-bottom: -48px'
      "
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { mdiClose } from "@mdi/js";
import { useTheme } from "vuetify";
import { useDisplay } from "vuetify";

defineProps({ isOptions: { type: Boolean, default: false } });

const { mdAndUp } = useDisplay();
const store = useAppStore();
const theme = useTheme();

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
