import { dirname, relative } from "node:path";
import type { UserConfig } from "vite";
import { defineConfig } from "vite";
import Vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { isDev, port, r } from "./scripts/utils";
import packageJson from "./package.json";
import Vuetify, { transformAssetUrls } from "vite-plugin-vuetify";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import VueRouter from "vue-router/vite";
import sri from "vite-plugin-sri-gen";

export const sharedConfig: UserConfig = {
  root: r("src"),
  resolve: {
    alias: {
      "@/": `${r("src")}/`,
    },
  },
  define: {
    __DEV__: isDev,
    __NAME__: JSON.stringify(packageJson.name),
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    VueRouter({
      dts: "src/route-map.d.ts",
    }),
    Vue({ template: { transformAssetUrls } }),
    Vuetify({
      autoImport: true,
    }),

    AutoImport({
      imports: [
        "vue",
        {
          "vue-router": ["onBeforeRouteLeave"],
        },
        "pinia",
        { "@/stores/app": ["useAppStore"] },
        {
          "webextension-polyfill": [["=", "browser"]],
        },
      ],
      dts: r("src/auto-imports.d.ts"),
      eslintrc: {
        enabled: true,
      },
      vueTemplate: true,
    }),
    // https://github.com/antfu/unplugin-vue-components
    Components({
      dirs: [r("src/components")],
      // generate `components.d.ts` for ts support with Volar
      dts: r("src/components.d.ts"),
    }),
    nodePolyfills(),

    // rewrite assets to use relative path
    {
      name: "assets-rewrite",
      enforce: "post",
      apply: "build",
      transformIndexHtml(html, { path }) {
        return html.replace(
          /"\/assets\//g,
          `"${relative(dirname(path), "/assets")}/`
        );
      },
    },
    sri({ runtimePatchDynamicLinks: false }),
  ],
  optimizeDeps: {
    include: [
      "@algorandfoundation/algokit-utils",
      "@ledgerhq/hw-transport-webhid",
      "@ledgerhq/hw-transport-webusb",
      "@scure/bip32",
      "ledger-algorand-js",
      "micro-key-producer/slip10.js",
    ],
    exclude: ["vue-demi", "vuetify", "falcon-1024"],
    esbuildOptions: {
      target: "esnext",
    },
  },
};

function entryFileNames(chunk: any) {
  return chunk.name?.includes("client")
    ? "assets/[name].js"
    : "assets/[name]-[hash].js";
}

export default defineConfig(({ command }) => ({
  ...sharedConfig,
  base: command === "serve" ? `http://localhost:${port}/` : "/dist/",
  server: {
    port,
    hmr: {
      host: "localhost",
    },
    origin: `http://localhost:${port}`,
  },
  build: {
    watch: isDev ? {} : undefined,
    outDir: r("extension/dist"),
    emptyOutDir: false,
    sourcemap: isDev ? "inline" : false,
    // https://developer.chrome.com/docs/webstore/program_policies/#:~:text=Code%20Readability%20Requirements
    terserOptions: {
      mangle: false,
    },
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      input: {
        client: r("src/ext/client.ts"),
        main: r("src/main/index.html"),
        options: r("src/options/index.html"),
        popup: r("src/popup/index.html"),
      },
      output: {
        entryFileNames,
        manualChunks: {
          algosdk: ["algosdk"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
}));
