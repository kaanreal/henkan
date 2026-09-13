import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTauriArgs, buildTauriSpawnOptions } from "./tauriCommand.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = buildTauriArgs(process.argv.slice(2));
const env = { ...process.env };

if (process.platform === "darwin" && process.arch === "arm64") {
  const shimPath = resolve(root, "src-tauri", "vendor");
  env.CXXFLAGS = [env.CXXFLAGS, `-I${shimPath}`].filter(Boolean).join(" ");
  env.CFLAGS = [env.CFLAGS, `-I${shimPath}`].filter(Boolean).join(" ");
}

const command = process.platform === "win32" ? "tauri.cmd" : "tauri";
const result = spawnSync(command, args, {
  ...buildTauriSpawnOptions(process.platform),
  cwd: root,
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
