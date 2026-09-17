import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTauriArgs, buildTauriSpawnOptions } from "./tauriCommand.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveTauriBinary() {
  if (process.platform !== "win32") return "tauri";

  // npm creates .cmd shims, while bun and pnpm create native .exe shims.
  const binDir = resolve(root, "node_modules", ".bin");
  const candidate = ["tauri.exe", "tauri.cmd"].find((name) =>
    existsSync(resolve(binDir, name)),
  );
  return candidate ? resolve(binDir, candidate) : "tauri.cmd";
}
const args = buildTauriArgs(process.argv.slice(2));
const env = { ...process.env };

if (process.platform === "darwin" && process.arch === "arm64") {
  const shimPath = resolve(root, "src-tauri", "vendor");
  env.CXXFLAGS = [env.CXXFLAGS, `-I${shimPath}`].filter(Boolean).join(" ");
  env.CFLAGS = [env.CFLAGS, `-I${shimPath}`].filter(Boolean).join(" ");
}

const command = resolveTauriBinary();
const result = spawnSync(command, args, {
  ...buildTauriSpawnOptions(process.platform),
  cwd: root,
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
