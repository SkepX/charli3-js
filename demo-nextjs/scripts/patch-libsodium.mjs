import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const src = path.join(
  root,
  "node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs",
);
const dest = path.join(
  root,
  "node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs",
);

if (!fs.existsSync(src)) {
  process.exit(0);
}
if (fs.existsSync(dest)) {
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log("patched libsodium-wrappers-sumo with sibling libsodium-sumo.mjs");
