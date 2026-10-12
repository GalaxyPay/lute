import { createRequire } from "node:module";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";

const VIRTUAL_ID = /^virtual:plugin-vuetify:(.*?)(\?.*)?$/;

// vite-plugin-vuetify serves each component's sass (with our settings file
// prepended) as a `virtual:plugin-vuetify:*` module whose contents live in an
// in-memory map filled only by its resolveId. When a dev server is asked to
// load one it hasn't resolved in this process — e.g. the browser fetching a
// URL from a cached (immutable `?v=`) vuetify module after a restart or
// branch switch — that lookup misses and Vite reports "Failed to load url
// virtual:plugin-vuetify:... Does the file exist?". Rebuild the module from
// the id instead. Must be listed after Vuetify() so its load runs first.
export function vuetifyStylesFallback(configFile: string): Plugin {
  const require = createRequire(import.meta.url);
  const lib = path.join(
    path.dirname(require.resolve("vuetify/package.json")),
    "lib"
  );
  return {
    name: "vuetify:styles-fallback",
    enforce: "pre",
    load(id) {
      const match = VIRTUAL_ID.exec(id);
      if (!match) return null;
      const target = path.join(lib, match[1]);
      if (
        path.relative(lib, target).startsWith("..") ||
        !/\.s[ac]ss$/.test(target)
      ) {
        return null;
      }
      const suffix = target.endsWith(".scss") ? ";\n" : "\n";
      return `@use "${normalizePath(configFile)}"${suffix}@use "${normalizePath(target)}"${suffix}`;
    },
  };
}
