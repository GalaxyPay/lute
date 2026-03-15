import { resolve } from "node:path";
import process from "node:process";
import { bgCyan, black } from "kolorist";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const port = Number(process.env.PORT || "") || 3303;
export const r = (...args: string[]) => resolve(__dirname, "..", ...args);
export const isDev = process.env.NODE_ENV !== "production";
export const isFirefox = process.env.EXTENSION === "firefox";

export function log(name: string, message: string) {
  console.log(black(bgCyan(` ${name} `)), message);
}
