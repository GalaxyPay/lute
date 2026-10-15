import { fileURLToPath } from "node:url";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    // Source modules use the auto-imported store; in tests it resolves to a
    // plain stub (see the alias below) so no Vuetify or network is loaded.
    AutoImport({
      imports: [{ "@/stores/app": ["useAppStore"] }],
      dts: false,
    }),
  ],
  resolve: {
    alias: [
      { find: /^@\/stores\/app$/, replacement: src("./tests/stubs/store.ts") },
      { find: /^@\//, replacement: src("./src/") },
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/localnet/**"],
        },
      },
      {
        // Against a running algokit localnet: `algokit localnet start`.
        extends: true,
        test: {
          name: "localnet",
          include: ["tests/localnet/**/*.test.ts"],
          globalSetup: ["tests/localnet/globalSetup.ts"],
          testTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,vue}"],
      exclude: ["src/clients/**", "src/**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
