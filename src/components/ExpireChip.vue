<template>
  <v-chip
    v-if="chipProps?.text"
    :color="chipProps.color"
    :text="chipProps.text"
    size="x-small"
    @click.stop="renew()"
  />
</template>
<script setup lang="ts">
import type { NsRecord } from "@/types";
import { expireDays } from "@/utils";

const props = defineProps<{ ns: NsRecord | undefined }>();
const chipProps = computed(() => {
  if (props.ns?.timeExpires == null) return;
  const expDays = expireDays(props.ns.timeExpires);
  if (expDays == null) return;
  if (expDays <= 1) return { color: "red", text: "Expriring" };
  if (expDays <= 30) return { color: "warning", text: `${expDays} Days` };
});
function renew() {
  const store = useAppStore();
  const url =
    store.network.nfdUrl?.replace("api.", "app.") + "/name/" + props.ns?.name;
  window.open(url, "_blank");
}
</script>
