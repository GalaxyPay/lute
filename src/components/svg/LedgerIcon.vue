<template>
  <svg
    :width="width"
    :height="height"
    :fill="color"
    :opacity="opacity"
    viewBox="0 0 154 134"
    xmlns="http://www.w3.org/2000/svg"
    @click="$emit('click')"
  >
    <path
      d="M0 0v38h11V11h47V0h38v11h47v27h11V0M58 38v58h38V86H69V38M0 134V96h11v27h47v11h38v-11h47V96h11v38"
    />
  </svg>
</template>

<script lang="ts">
export default {
  props: {
    width: { type: Number, default: 24 },
    height: { type: Number, default: null },
    color: { type: String, default: "white" },
    opacity: { type: Number, default: 1 },
  },
  emits: ["click"],
};
</script>
