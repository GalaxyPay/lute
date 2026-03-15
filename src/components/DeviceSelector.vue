<template>
  <v-container class="pt-0">
    <v-card>
      <v-card-title class="text-h5">Please select a device</v-card-title>
      <v-container>
        <v-data-table
          :items="store.device.list"
          :headers="headers"
          class="no-select"
          items-per-page="-1"
          @click:row="select"
          hover
        >
          <template #headers />
          <template #no-data>
            <i>No Devices Connected</i>
          </template>
          <template #[`item.index`]="{ index }">
            {{ index + 1 }}
          </template>
          <template #bottom />
        </v-data-table>
      </v-container>
      <v-container>
        <v-row class="text-center">
          <v-col>
            <v-btn text="Re-Scan Devices" @click="store.getDevices()" />
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-container>
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
