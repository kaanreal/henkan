import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function wasmSourceHash(root) {
  const rustSources = [];
  const collectRust = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collectRust(path);
      else if (entry.name.endsWith(".rs")) rustSources.push(path);
    }
  };
  for (const directory of [
    "wasm-core/src",
    "src-tauri/src/converters",
    "src-tauri/src/models",
    "src-tauri/src/parsers",
  ]) {
    collectRust(join(root, directory));
  }

  const inputs = [
    join(root, "wasm-core", "Cargo.toml"),
    join(root, "wasm-core", "Cargo.lock"),
    ...rustSources,
  ].sort();

  const hash = createHash("sha256");
  for (const path of inputs) {
    hash.update(path.slice(root.length).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}
