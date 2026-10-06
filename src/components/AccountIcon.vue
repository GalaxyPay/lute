<template>
  <v-badge
    :model-value="isUpgradeable(item.secret) && !item.subType"
    location="top right"
    color="info"
    dot
  >
    <v-icon v-if="item.appId" size="small" :icon="mdiKeyChange" class="mr-1" />
    <v-icon
      v-else-if="item.subType === 'hd'"
      :icon="mdiSubdirectoryArrowRight"
    />
    <v-icon
      v-else-if="item.subType === 'rekey'"
      size="small"
      :icon="mdiKey"
      class="mr-1"
    />
    <v-icon v-else-if="item.isHot" :icon="mdiFire" />
    <v-icon
      v-else-if="item.seedId && item.slot != null"
      :icon="mdiWallet"
      size="small"
      class="mr-1"
    />
    <v-icon v-else-if="item.slot != null" class="pr-1">
      <ledger-icon :width="18" color="currentColor" />
    </v-icon>
    <v-icon v-else-if="item.isFalcon25" :icon="mdiAtom" />
    <v-icon v-else :icon="mdiEye" size="small" class="mr-1" />
    <v-tooltip
      v-if="isUpgradeable(item.secret)"
      activator="parent"
      location="top"
      text="Upgrade Account from the menu"
    />
  </v-badge>
</template>

<script setup lang="ts">
import { isUpgradeable } from "@/services/accountSecret";
import type { AccountInfo } from "@/types";
import {
  mdiAtom,
  mdiEye,
  mdiFire,
  mdiKey,
  mdiKeyChange,
  mdiSubdirectoryArrowRight,
  mdiWallet,
} from "@mdi/js";

defineProps<{ item: AccountInfo }>();
</script>
