<template>
  <v-dialog v-model="show" max-width="520" persistent>
    <v-card>
      <div class="dialog-header dialog-header--divider">
        <div class="min-w-0">
          <template v-if="type === HD && stepTitle">
            <div class="dialog-breadcrumb">Add an account › {{ HD }}</div>
            <div class="dialog-heading">{{ stepTitle }}</div>
          </template>
          <template v-else>
            <div v-if="type" class="dialog-breadcrumb">Add an account</div>
            <div class="dialog-heading">{{ type || "Add an account" }}</div>
          </template>
        </div>
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          aria-label="Close"
          @click="show = false"
        />
      </div>
      <div v-if="!type" class="type-list">
        <v-list class="pa-0">
          <v-list-item
            v-for="t in mainTypes"
            :key="t.title"
            :title="t.title"
            :subtitle="t.subtitle"
            class="type-item"
            @click="t.select()"
          >
            <template #prepend>
              <div class="type-icon">
                <ledger-icon
                  v-if="t.title === LEDGER"
                  :width="16"
                  color="currentColor"
                />
                <v-icon v-else :icon="t.icon" size="18" />
              </div>
            </template>
            <template #append>
              <v-icon :icon="mdiChevronRight" size="18" />
            </template>
          </v-list-item>
        </v-list>
        <template v-if="showMore">
          <div class="type-more">More</div>
          <v-list class="pa-0">
            <v-list-item
              v-for="t in moreTypes"
              :key="t.title"
              :title="t.title"
              :subtitle="t.subtitle"
              class="type-item type-item--more"
              @click="t.select()"
            >
              <template #prepend>
                <div class="type-icon">
                  <v-icon :icon="t.icon" size="18" />
                </div>
              </template>
              <template #append>
                <v-icon :icon="mdiChevronRight" size="18" />
              </template>
            </v-list-item>
          </v-list>
        </template>
        <div v-else class="text-center pt-2">
          <v-btn
            @click="showMore = true"
            :append-icon="mdiChevronDown"
            text="More"
          />
        </div>
      </div>
      <h-d-wallet
        v-else-if="type === HD"
        @close="show = false"
        @title="stepTitle = $event"
      />
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
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiEye,
  mdiFire,
  mdiImport,
  mdiKeyChange,
  mdiWallet,
} from "@mdi/js";

const store = useAppStore();
const type = ref();
// Set by the HD wallet flow to name its current step.
const stepTitle = ref<string>();

const LEDGER = "Ledger account";
const WATCH = "Watch account";
const HD = "HD wallet";
const MSIG = "Multi-sig account";
const HOT = "Algo25 account";
const MN12 = "12-word account";
const FALCON = "Falcon25 account";

const showMore = ref(false);
const mainTypes = computed(() => [
  {
    title: LEDGER,
    subtitle: "Attach your device via USB with the Algorand app ready",
    select: () => (type.value = LEDGER),
  },
  {
    title: HD,
    subtitle: hasSeed.value
      ? "Add another account from your seed"
      : "24-word seed, derives multiple accounts",
    icon: mdiWallet,
    select: () => (type.value = HD),
  },
  {
    title: FALCON,
    subtitle: "Post-quantum secure",
    icon: mdiAtom,
    select: () => (type.value = FALCON),
  },
]);
const moreTypes = [
  {
    title: HOT,
    subtitle: "25-word seed, single account",
    icon: mdiFire,
    select: () => alertSelect(HOT),
  },
  {
    title: MSIG,
    subtitle: "On-chain (ARC-55)",
    icon: mdiKeyChange,
    select: () => (type.value = MSIG),
  },
  {
    title: MN12,
    subtitle: "Convert your Exodus, Trust, or Coinomi to Algo25",
    icon: mdiImport,
    select: () => alertSelect(MN12),
  },
  {
    title: WATCH,
    subtitle: "Keep an eye on things",
    icon: mdiEye,
    select: () => (type.value = WATCH),
  },
];
const hasSeed = computed(
  () =>
    store.keystore.some((k) => k.id.startsWith("bip39:")) ||
    store.seeds.length > 0
);

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
    if (val) {
      type.value = undefined;
      stepTitle.value = undefined;
      showMore.value = false;
    }
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

<style scoped>
.type-list {
  padding: 14px 14px 14px;
}
.type-item {
  padding: 12px !important;
  border-radius: 10px !important;
  border: 1px solid transparent;
  margin-bottom: 2px;
}
.type-item:hover {
  background: rgb(var(--v-theme-surface-variant)) !important;
  border-color: rgb(var(--v-theme-border-strong));
}
.type-item :deep(.v-list-item-title) {
  font-size: 14px;
  font-weight: 500;
}
.type-item :deep(.v-list-item-subtitle) {
  font-size: 12.5px;
  line-height: 1.4;
  margin-top: 2px;
  color: rgb(var(--v-theme-text-muted));
  opacity: 1;
  -webkit-line-clamp: unset;
}
.type-item--more {
  padding: 10px 12px !important;
}
.type-item--more :deep(.v-list-item-title) {
  font-weight: 400;
}
.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-inline-end: 14px;
  border-radius: 9px;
  background: rgb(var(--v-theme-border));
  border: 1px solid rgb(var(--v-theme-border-strong));
  color: rgb(var(--v-theme-text-body));
}
.type-item--more .type-icon {
  background: rgb(var(--v-theme-surface-variant));
  border-color: transparent;
  color: rgb(var(--v-theme-text-muted));
}
.type-more {
  padding: 8px 12px 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-text-dim));
}
.min-w-0 {
  min-width: 0;
}
</style>
