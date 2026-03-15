import fs from "fs-extra";
import type { Manifest } from "webextension-polyfill";
import type PkgType from "../../package.json";
import { isDev, isFirefox, port, r } from "../../scripts/utils";

const connect = ["http:", "https:"];
if (isDev) connect.push("ws:");
const script = ["'self'", "'wasm-unsafe-eval'"];
if (isDev) script.push(`http://localhost:${port}`);
const directives = [
  "default-src 'self'",
  `connect-src ${connect.join(" ")}`,
  "img-src data: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${script.join(" ")}`,
];
const csp = directives.join("; ");

export async function getManifest() {
  const pkg = (await fs.readJSON(r("package.json"))) as typeof PkgType;

  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: pkg.displayName || pkg.name,
    version: pkg.version,
    description: pkg.description,
    action: {
      default_icon: "./assets/icon-128.png",
      default_popup: "./dist/popup/index.html",
    },
    options_ui: {
      page: "./dist/options/index.html",
      open_in_tab: true,
    },
    background: isFirefox
      ? {
          scripts: ["dist/background/index.mjs"],
          type: "module",
        }
      : {
          service_worker: "./dist/background/index.mjs",
        },
    icons: {
      16: "assets/icon-16.png",
      32: "assets/icon-32.png",
      48: "assets/icon-48.png",
      128: "assets/icon-128.png",
    },
    permissions: ["declarativeNetRequestWithHostAccess", "sidePanel"],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["dist/contentScripts/index.global.js"],
      },
    ],
    web_accessible_resources: [
      {
        resources: ["/assets/icon-16.png"],
        matches: ["<all_urls>"],
      },
      {
        resources: ["dist/assets/client.js"],
        matches: ["<all_urls>"],
      },
    ],
    content_security_policy: {
      extension_pages: csp,
    },
    host_permissions: ["*://ipfs.algonode.dev/*", "*://*.4160.nodely.io/*"],
  };

  // add sidepanel
  if (isFirefox) {
    manifest.sidebar_action = {
      default_panel: "dist/main/index.html",
    };
  } else {
    // the sidebar_action does not work for chromium based
    (manifest as any).side_panel = {
      default_path: "dist/main/index.html",
    };
  }

  // FIXME: not work in MV3
  // if (isDev) {
  //   // for content script, as browsers will cache them for each reload,
  //   // we use a background script to always inject the latest version
  //   // see src/background/contentScriptHMR.ts
  //   delete manifest.content_scripts;
  //   manifest.permissions?.push("webNavigation");
  // }

  return manifest;
}
