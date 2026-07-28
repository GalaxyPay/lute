import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const html = readFileSync("dist/index.html", "utf8");
const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!map) throw new Error("no import map found in dist/index.html");

const hash = createHash("sha256").update(map[1]).digest("base64");
const toml = readFileSync("dist/netlify.toml", "utf8");
writeFileSync(
  "dist/netlify.toml",
  toml.replace("script-src 'self'", `script-src 'self' 'sha256-${hash}'`)
);
