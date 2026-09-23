import { spawnSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wasmSourceHash } from "./wasm-source-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remap = `--remap-path-prefix=${root}=.`;
const rustflags = [process.env.RUSTFLAGS, remap].filter(Boolean).join(" ");

const result = spawnSync(
  process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack",
  ["build", "--target", "web", "--release", "wasm-core"],
  {
    cwd: root,
    env: { ...process.env, RUSTFLAGS: rustflags },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const file of [
  "henkan_core_bg.wasm",
  "henkan_core.js",
  "henkan_core.d.ts",
  "henkan_core_bg.wasm.d.ts",
]) {
  copyFileSync(join(root, "wasm-core", "pkg", file), join(root, "src", "wasm", file));
}

writeFileSync(join(root, "src", "wasm", "source.sha256"), `${wasmSourceHash(root)}\n`);
