<template>
  <svg
    :width="width"
    :height="height"
    :fill="color"
    :opacity="opacity"
    viewBox="0 0 400 400"
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon points="0 400 200 400 400 400 400 200 400 0 200 0 200 200 0 0" />
  </svg>
</template>

<script lang="ts">
export default {
  props: {
    width: { type: Number },
    height: { type: Number },
    color: { type: String, default: null },
    opacity: { type: Number, default: 1 },
  },
};
</script>
