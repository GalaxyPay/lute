<template>
  <div class="device-select">
    <div class="title-panel px-2 pb-3">Please select a device</div>
    <v-data-table
      :items="store.device.list"
      :headers="headers"
      class="no-select device-table"
      items-per-page="-1"
      @click:row="select"
      hover
    >
      <template #headers />
      <template #no-data>No Devices Connected</template>
      <template #[`item.index`]="{ index }">
        <span class="text-dim font-mono text-caption">{{ index + 1 }}</span>
      </template>
      <template #bottom />
    </v-data-table>
    <div class="device-footer">
      <v-btn
        block
        size="large"
        variant="outlined"
        text="Re-Scan Devices"
        @click="store.getDevices()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const store = useAppStore();
const headers: any[] = [
  { key: "index", sortable: false },
  { title: "Name", key: "productName", sortable: false },
];
async function select(_event: any, row: any) {
  store.selectDevice(row.item);
}
</script>

<style scoped>
.device-select {
  display: flex;
  flex-direction: column;
  padding: 20px 10px 0;
}
.device-table :deep(td:first-child) {
  width: 28px;
}
.device-footer {
  margin-top: 16px;
  padding: 14px 6px;
  border-top: 1px solid rgb(var(--v-theme-border));
}
</style>
