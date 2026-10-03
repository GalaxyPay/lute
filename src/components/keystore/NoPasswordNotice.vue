<template>
  <v-alert
    v-if="store.keystoreMode === 'device'"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-2 text-left"
  >
    This wallet has no password. Anyone with access to this browser profile can
    sign with the accounts stored in it.
    <template #append>
      <v-btn text="Set Password" size="small" @click="show = true" />
    </template>
  </v-alert>
  <v-dialog v-model="show" max-width="600" persistent>
    <password-create @close="show = false" />
  </v-dialog>
</template>

<script lang="ts" setup>
const store = useAppStore();
const show = ref(false);
</script>
