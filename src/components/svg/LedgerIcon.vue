<template>
  <svg
    :width="width"
    :height="height"
    :fill="color"
    :opacity="opacity"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    @click="$emit('click')"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M11 0C8.79086 0 7 1.79086 7 4V12.101C7.57412 11.5151 8.2504 11.0297 9 10.6736V4C9 2.89543 9.89543 2 11 2H13C14.1046 2 15 2.89543 15 4V10.6736C15.7496 11.0297 16.4259 11.5151 17 12.101V4C17 1.79086 15.2091 0 13 0H11Z"
    ></path>
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M7 17C7 14.2386 9.23858 12 12 12C14.7614 12 17 14.2386 17 17V22.0909C17 23.1453 16.1453 24 15.0909 24H8.90909C7.85473 24 7 23.1453 7 22.0909V17ZM12 14C10.3431 14 9 15.3431 9 17V22H15V17C15 15.3431 13.6569 14 12 14Z"
    ></path>
    <circle cx="12" cy="17" r="1"></circle>
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
