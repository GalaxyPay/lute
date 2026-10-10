<template>
  <template v-if="xs">
    <v-bottom-navigation
      v-if="notModal"
      grow
      :height="store.isWeb ? 64 : 54"
      :disabled="!!store.loading"
      class="bottom-nav"
      :class="store.isWeb && 'bottom-nav--safe'"
    >
      <v-btn
        v-for="btn in items"
        :key="btn.title"
        :to="btn.to"
        :text="btn.title"
        :ripple="false"
      />
      <v-btn
        text="Settings"
        :active="store.isWeb && router.currentRoute.value.path === '/settings'"
        :ripple="false"
        @click="handleSettings()"
      />
    </v-bottom-navigation>
  </template>
  <v-navigation-drawer
    v-model="navDrawer"
    :permanent="mdAndUp"
    :width="mdAndUp ? 232 : 290"
    :color="mdAndUp ? 'background' : 'surface'"
    class="app-drawer"
    :class="xs && 'app-drawer--touch'"
  >
    <!-- Otherwise the app bar shows the logo and network chip. -->
    <div v-if="store.isWeb && mdAndUp" class="drawer-logo">
      <lute-logo
        :color="store.theme === 'gold' ? 'url(#gradient)' : 'currentColor'"
        :width="99"
      />
      <v-chip
        v-show="store.networkName !== 'MainNet'"
        class="net-chip"
        color="error"
        :text="store.networkName"
      />
    </div>
    <v-list nav class="pa-0">
      <template v-if="!xs">
        <v-list-item
          v-for="item in items"
          :key="item.title"
          :title="item.title"
          :to="item.to"
          :exact="item.exact"
          class="nav-item"
        />
        <v-list-item
          title="Settings"
          to="/settings"
          class="nav-item"
          @click.prevent="handleSettings()"
        />
        <v-divider class="my-3 mx-2" />
      </template>
      <v-list-item
        v-for="link in links"
        :key="link.title"
        :title="link.title"
        :href="link.href"
        target="_blank"
        class="nav-item"
      >
        <template #append>
          <v-icon :icon="mdiArrowTopRight" size="14" />
        </template>
      </v-list-item>
    </v-list>
    <div class="drawer-network">
      <v-select
        label="Network"
        :items="networks"
        item-title="name"
        v-model="network"
        hide-details
      >
        <template #prepend-inner>
          <span
            class="net-dot"
            :class="store.networkName === 'MainNet' ? 'bg-success' : 'bg-error'"
          />
        </template>
      </v-select>
    </div>
    <template #append>
      <div class="drawer-footer">
        <a
          v-if="store.isWeb"
          class="store-badge"
          href="https://chromewebstore.google.com/detail/lute/kiaoohollfkjhikdifohdckeidckokjh"
          target="_blank"
        >
          <img
            src="@/assets/store.png"
            alt="Available in the Chrome Web Store"
          />
        </a>
        <div class="text-dim">
          Lute · Version {{ appVersion }} ·
          <router-link to="/privacy" class="text-dim"
            >Privacy policy</router-link
          >
        </div>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { networks } from "@/data";
import { set } from "@/dbLute";
import router from "@/router";
import { mdiArrowTopRight } from "@mdi/js";
import { useDisplay } from "vuetify";

const appVersion = __APP_VERSION__;
const store = useAppStore();
const { mdAndUp, xs } = useDisplay();

const items = [{ title: "Accounts", to: "/", exact: true }];
const links = [
  {
    title: "NFD Segments",
    href: "https://app.nf.domains/name/lute.algo?view=segments",
  },
  { title: "Discord", href: "https://discord.gg/JuFu6J8ddc" },
  { title: "GitHub", href: "https://github.com/GalaxyPay/lute" },
];

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
.app-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  padding: 22px 14px 0;
}
.drawer-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 26px;
}
.nav-item {
  min-height: 0;
  padding: 9px 10px !important;
  margin-bottom: 2px;
  border-radius: 7px !important;
  color: rgb(var(--v-theme-text-muted));
}
.nav-item :deep(.v-list-item-title) {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
}
.nav-item :deep(.v-list-item__append > .v-icon) {
  color: rgb(var(--v-theme-text-dim));
}
.nav-item:hover {
  color: rgb(var(--v-theme-on-surface));
}
.nav-item.v-list-item--active {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-on-surface));
}
.v-theme--light .nav-item.v-list-item--active {
  background: rgba(var(--v-theme-primary), 0.1);
}
.v-theme--gold .nav-item.v-list-item--active {
  background: rgb(var(--v-theme-surface-variant));
}
.nav-item.v-list-item--active :deep(.v-list-item-title) {
  font-weight: 500;
}
.app-drawer--touch .nav-item {
  min-height: 44px;
  padding: 12px 10px !important;
  color: rgb(var(--v-theme-text-body));
}
.app-drawer--touch .nav-item :deep(.v-list-item-title) {
  font-size: 15px;
}
.drawer-network {
  margin-top: 20px;
  padding: 0 4px 14px;
}
.drawer-network :deep(.v-field__input) {
  font-size: 13px;
}
.net-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-inline-end: 2px;
}
.drawer-footer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 18px 18px;
  font-size: 11px;
}
.store-badge {
  align-self: flex-start;
  line-height: 0;
}
.store-badge img {
  width: 150px;
  aspect-ratio: 206 / 58;
  background: #fff;
  border: 1px solid rgb(var(--v-theme-border-strong));
  border-radius: 6px;
}
.bottom-nav :deep(.v-btn) {
  font-size: 12px;
  font-weight: 400;
  color: rgb(var(--v-theme-text-dim));
}
.bottom-nav :deep(.v-btn--active) {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  box-shadow: inset 0 2px 0 rgb(var(--v-theme-primary));
}
.bottom-nav :deep(.v-btn__overlay) {
  opacity: 0 !important;
}
.bottom-nav--safe {
  padding-bottom: 16px;
}
</style>
