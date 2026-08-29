import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const rustSources = [];
const collectRust = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectRust(path);
    else if (entry.name.endsWith(".rs")) rustSources.push(path);
  }
};
collectRust(join(root, "wasm-core", "src"));

const inputs = [
  join(root, "wasm-core", "Cargo.toml"),
  join(root, "wasm-core", "Cargo.lock"),
  ...rustSources,
  ...[
    "src-tauri/src/converters/etterna_to_osu.rs",
    "src-tauri/src/converters/osu_to_etterna.rs",
    "src-tauri/src/models/beatmap.rs",
    "src-tauri/src/models/timing.rs",
    "src-tauri/src/parsers/etterna.rs",
    "src-tauri/src/parsers/osu.rs",
  ].map((path) => join(root, path)),
].sort();

const hash = createHash("sha256");
for (const path of inputs) {
  hash.update(path.slice(root.length).replaceAll("\\", "/"));
  hash.update("\0");
  hash.update(readFileSync(path));
  hash.update("\0");
}
writeFileSync(join(root, "src", "wasm", "source.sha256"), `${hash.digest("hex")}\n`);
