import { defineConfig } from "vite";
import { sharedConfig } from "./vite.config.ext.mjs";
import { isDev, r } from "./scripts/utils.js";
import packageJson from "./package.json" with { type: "json" };

// Bundles the MAIN-world client script (window.lute) for `pnpm devx`. The
// manifest requires dist/assets/client.js, which the dev server never writes;
// production builds produce it from the `client` entry in vite.config.ext.mts.
export default defineConfig({
  ...sharedConfig,
  define: {
    __DEV__: isDev,
    __NAME__: JSON.stringify(packageJson.name),
    "process.env.NODE_ENV": JSON.stringify(
      isDev ? "development" : "production"
    ),
  },
  build: {
    watch: isDev ? {} : undefined,
    outDir: r("extension/dist/assets"),
    emptyOutDir: false,
    sourcemap: isDev ? "inline" : false,
    lib: {
      entry: r("src/ext/client.ts"),
      name: "luteClient",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "client.js",
        extend: true,
      },
    },
  },
});
