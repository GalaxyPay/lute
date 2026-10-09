<template>
  <v-alert
    v-if="store.keystoreMode === 'device'"
    type="warning"
    class="text-left"
  >
    This wallet has no password. Anyone with access to this browser profile can
    sign with its accounts.
    <template #append>
      <v-btn
        text="Set password"
        size="small"
        class="my-n1"
        @click="show = true"
      />
    </template>
  </v-alert>
  <v-dialog v-model="show" max-width="440" persistent>
    <password-create @close="show = false" />
  </v-dialog>
</template>

<script lang="ts" setup>
const store = useAppStore();
const show = ref(false);
</script>
