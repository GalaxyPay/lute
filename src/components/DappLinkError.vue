<template>
  <div class="ext-page">
    <div class="ext-header">
      <div class="title-panel">
        {{
          problem === "missing" ? `Can't reach ${site}` : "No request received"
        }}
      </div>
    </div>
    <div class="ext-body d-flex flex-column ga-3 text-text-body">
      <template v-if="problem === 'missing'">
        <div>
          Lute can't send a response back to the site that opened this window,
          so this request can't be completed.
        </div>
        <div>
          The site may block popup windows from talking back to it (its
          Cross-Origin-Opener-Policy setting). Try the Lute browser extension,
          or let the site know.
        </div>
      </template>
      <template v-else>
        <div>
          {{ site }} opened Lute but didn't send a request. Close this window
          and try again from the site.
        </div>
        <div>If this keeps happening, let the site know.</div>
      </template>
    </div>
    <div class="ext-footer">
      <v-btn block size="large" variant="flat" text="Close" @click="close()" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { DappLinkProblem } from "@/utils";

defineProps<{ problem: DappLinkProblem }>();

// lute-connect opens the popup with the dapp's siteName as the window name.
const site = window.name || "the site";

function close() {
  window.close();
}
</script>
