<template>
  <template v-if="xs">
    <v-bottom-navigation v-if="notModal" grow :disabled="!!store.loading">
      <v-btn
        v-for="btn in items"
        :key="btn.title"
        :to="btn.to"
        class="text-caption"
        base-color="grey"
        active-color="white"
        :ripple="false"
      >
        <v-icon :icon="btn.icon" />
        {{ btn.title }}
      </v-btn>
      <v-btn
        @click="handleSettings()"
        class="text-caption"
        :active="store.isWeb && router.currentRoute.value.path === '/settings'"
        base-color="grey"
        active-color="white"
        :ripple="false"
      >
        <v-icon :icon="mdiCog" />
        Settings
      </v-btn>
    </v-bottom-navigation>
  </template>
  <template v-else>
    <v-navigation-drawer
      v-model="navDrawer"
      :permanent="mdAndUp"
      floating
      color="background"
    >
      <v-list-item
        v-for="item in items"
        :key="item.title"
        :title="item.title"
        :prepend-icon="item.icon"
        :to="item.to"
        :exact="item.exact"
      />
      <v-list-item
        title="Settings"
        :prepend-icon="mdiCog"
        @click.prevent="handleSettings()"
        to="/settings"
      />
      <v-divider />
      <v-list-item
        title="NFD Segments"
        href="https://app.nf.domains/name/lute.algo?view=segments"
        target="_blank"
      >
        <template #prepend>
          <v-icon>
            <n-f-d-logo :width="18" color="currentColor" />
          </v-icon>
        </template>
      </v-list-item>
      <v-list-item
        title="Discord"
        href="https://discord.gg/JuFu6J8ddc"
        target="_blank"
      >
        <template #prepend>
          <v-icon>
            <discord-logo :width="20" color="currentColor" />
          </v-icon>
        </template>
      </v-list-item>
      <v-list-item
        title="Github"
        href="https://github.com/GalaxyPay/lute"
        target="_blank"
      >
        <template #prepend>
          <v-icon>
            <github-logo :width="21" color="currentColor" />
          </v-icon>
        </template>
      </v-list-item>
      <v-container class="pt-6">
        <v-select
          label="Network"
          density="compact"
          :items="networks"
          item-title="name"
          v-model="network"
        />
      </v-container>
      <template #append>
        <div v-if="store.isWeb" class="text-center">
          <a
            href="https://chromewebstore.google.com/detail/lute/kiaoohollfkjhikdifohdckeidckokjh"
            target="_blank"
          >
            <img src="@/assets/store.png" />
          </a>
        </div>
        <div class="text-center pa-2" style="color: #9aa0a5; font-size: 9px">
          Lute • Version
          {{ appVersion }} •
          <router-link to="/privacy" class="text-grey">
            Privacy Policy
          </router-link>
        </div>
      </template>
    </v-navigation-drawer>
  </template>
</template>

<script setup lang="ts">
import { networks } from "@/data";
import { set } from "@/dbLute";
import router from "@/router";
import { mdiCog, mdiHome } from "@mdi/js";
import { useDisplay } from "vuetify";

const appVersion = __APP_VERSION__;
const store = useAppStore();
const { mdAndUp, xs } = useDisplay();

const items = [{ title: "Accounts", icon: mdiHome, to: "/", exact: true }];

const notModal = computed(() => !router.currentRoute.value.meta?.modal);
const navDrawer = computed({
  get() {
    return notModal.value && (mdAndUp.value || store.drawer);
  },
  set(val) {
    store.drawer = val;
  },
});

function handleSettings() {
  if (store.isWeb) {
    router.push("/settings");
  } else {
    browser.runtime.openOptionsPage();
  }
}

const network = computed({
  get() {
    return store.networkName;
  },
  async set(val) {
    await set("app", "networkName", val);
    await store.getCache();
    store.refresh++;
  },
});
</script>

<style scoped>
:deep(.v-btn .v-btn__overlay) {
  opacity: 0 !important;
}
</style>
