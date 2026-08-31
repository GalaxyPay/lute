/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */
import "@/styles";
import "./utils/gtag";

// Plugins
import { registerPlugins } from "@/plugins";
import router from "@/router";

// Components
import App from "./App.vue";

// Composables
import { createApp } from "vue";

const app = createApp(App);

registerPlugins(app);

router.isReady().then(() => app.mount("#app"));
