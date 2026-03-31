// Plugins
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Vue from "@vitejs/plugin-vue";
import VueRouter from "vue-router/vite";
import Vuetify, { transformAssetUrls } from "vite-plugin-vuetify";
import { VitePWA } from "vite-plugin-pwa";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import sri from "vite-plugin-sri-gen";

// Utilities
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const connect = [
  "'self'",
  "*.nf.domains",
  "api.envoi.sh",
  "ipfs.algonode.dev",
  "asa-list.tinyman.org",
  "*.lute.app",
  "*.nodely.dev",
  "*.nodely.io",
  "*.algonode.xyz",
  "*.algonode.network",
  "*.algorand.foundation",
  "www.google-analytics.com",
  "http://localhost:*",
  "wss:",
];
const csp = [
  "default-src 'self'",
  `connect-src ${connect.join(" ")}`,
  "img-src data: https: http:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval' www.googletagmanager.com blob:",
].join("; ");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    VueRouter({
      dts: "src/route-map.d.ts",
    }),
    AutoImport({
      imports: [
        "vue",
        {
          "vue-router": ["onBeforeRouteLeave"],
        },
        "pinia",
        { "@/stores/app": ["useAppStore"] },
      ],
      dts: "src/auto-imports.d.ts",
      eslintrc: {
        enabled: true,
      },
      vueTemplate: true,
    }),
    Components({
      dts: "src/components.d.ts",
    }),
    Vue({
      template: { transformAssetUrls },
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
    }),
    // process.platform === "win32" ? mkcert() : basicSsl(),
    nodePolyfills(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon-gold.ico",
        "apple-touch-icon.png",
        "mask-icon.svg",
        "og-img.png",
      ],
      manifest: {
        name: "Lute",
        short_name: "Lute",
        description: "An Algorand Wallet",
        theme_color: "#000000",
        background_color: "#000000",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable_icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    sri({ skipResources: ["https://www.googletagmanager.com/*"] }),
  ],
  define: {
    "process.env": {},
    "process.version": JSON.stringify(process.version),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    extensions: [".js", ".json", ".jsx", ".mjs", ".ts", ".tsx", ".vue"],
  },
  server: {
    port: 3031,
    headers: { "content-security-policy": csp },
  },
  build: {
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          algosdk: ["algosdk"],
        },
      },
      external: ["workbox-window"],
    },
    target: "esnext",
  },
  optimizeDeps: {
    include: [
      "@algorandfoundation/algokit-utils",
      "@ledgerhq/hw-transport-webhid",
      "@ledgerhq/hw-transport-webusb",
      "@scure/bip32",
      "ledger-algorand-js",
      "micro-key-producer/slip10.js",
    ],
    exclude: ["vuetify", "falcon-1024"],
    esbuildOptions: {
      target: "esnext",
    },
  },
});
