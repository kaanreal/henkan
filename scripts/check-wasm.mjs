import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wasmSourceHash } from "./wasm-source-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expected = readFileSync(join(root, "src", "wasm", "source.sha256"), "utf8").trim();
const actual = wasmSourceHash(root);

if (actual !== expected) {
  console.error("Web converter WASM is stale. Run `npm run build:wasm` and commit src/wasm.");
  process.exit(1);
}
