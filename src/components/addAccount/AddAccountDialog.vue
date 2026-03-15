<template>
  <v-dialog v-model="show" max-width="600" persistent>
    <v-card>
      <v-card-title class="pt-3 d-flex">
        {{ type || "Add an Account" }}
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="show = false" />
      </v-card-title>
      <v-container v-if="!type" class="pt-0">
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="type = LEDGER"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <ledger-icon color="currentColor" />
                </v-col>
                <v-col>
                  {{ LEDGER }}
                  <div class="text-grey">
                    Attach your device via USB with the Algorand app ready
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="type = HD"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiWallet" />
                </v-col>
                <v-col>
                  {{ HD }} <v-chip text="New" size="small" class="ml-1" />
                  <div class="text-grey">
                    24-word seed, derives multiple accounts
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="alertSelect(HOT)"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiFire" />
                </v-col>
                <v-col>
                  {{ HOT }} <v-chip text="Legacy" size="small" class="ml-1" />
                  <div class="text-grey">
                    25-word seed, single account, non-extractable
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="type = MSIG"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiKeyChange" />
                </v-col>
                <v-col>
                  {{ MSIG }}
                  <div class="text-grey">On-Chain (ARC-55)</div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="alertSelect(MN12)"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiImport" />
                </v-col>
                <v-col>
                  {{ MN12 }}
                  <div class="text-grey">
                    Convert your Exodus, Trust, or Coinomi to Algo25
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container v-if="store.experimental">
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="type = FALCON"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiAtom" />
                </v-col>
                <v-col>
                  {{ FALCON }}
                  <v-chip text="Experimental" size="small" class="ml-1" />
                  <div class="text-grey">Post-Quantum Secure</div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
        <v-container>
          <v-card variant="outlined" color="primary" class="pointer">
            <v-container
              :class="theme.name.value == 'light' ? 'text-black' : 'text-white'"
              @click="type = WATCH"
            >
              <v-row>
                <v-col align-self="center" cols="auto">
                  <v-icon :icon="mdiEye" />
                </v-col>
                <v-col>
                  {{ WATCH }}
                  <div class="text-grey">Keep an eye on things</div>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-container>
      </v-container>
      <h-d-wallet v-else-if="type === HD" @close="show = false" />
      <ledger v-else-if="type === LEDGER" @close="show = false" />
      <multi-sig v-else-if="type === MSIG" @close="show = false" />
      <watch v-else-if="type === WATCH" @close="show = false" />
      <hot v-else-if="type === HOT" @close="show = false" />
      <mn12 v-else-if="type === MN12" @close="show = false" />
      <falcon v-else-if="type === FALCON" @close="show = false" />
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {
  mdiAtom,
  mdiClose,
  mdiEye,
  mdiFire,
  mdiImport,
  mdiKeyChange,
  mdiWallet,
} from "@mdi/js";
import { useTheme } from "vuetify";

const store = useAppStore();
const theme = useTheme();
const type = ref();

const LEDGER = "Ledger Account";
const WATCH = "Watch Account";
const HD = "HD Wallet";
const MSIG = "Multi-Sig Account";
const HOT = "Algo25 Account";
const MN12 = "12-Word Account";
const FALCON = "Falcon Account";

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const show = computed({
  get() {
    return props.visible;
  },
  set(val) {
    if (!val) {
      emit("close");
    }
  },
});

watch(
  () => props.visible,
  (val) => {
    if (val) type.value = undefined;
  }
);

function alertSelect(val: string) {
  if (!store.hotWallet)
    alert(
      `You must enable "Experimental Web Platform features" in chrome://flags to use this feature.`
    );
  else type.value = val;
}
</script>
