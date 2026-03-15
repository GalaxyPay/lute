import type { App } from "vue";
import pinia from "@/stores";
import vuetify from "@/plugins/vuetify";

export function setupApp(app: App) {
  // Inject a globally available `$app` object in template
  app.config.globalProperties.$app = {
    context: "",
  };

  // Provide access to `app` in script setup with `const app = inject('app')`
  app.provide("app", app.config.globalProperties.$app);

  app.use(vuetify).use(pinia);

  // Here you can install additional plugins for all contexts: popup, options page and content-script.
  // example: app.use(i18n)
  // example excluding content-script context: if (context !== 'content-script') app.use(i18n)
}
