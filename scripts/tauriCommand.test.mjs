import test from "node:test";
import assert from "node:assert/strict";
import { buildTauriArgs, buildTauriSpawnOptions } from "./tauriCommand.mjs";

test("enables MinaCalc for normal Tauri dev commands", () => {
  assert.deepEqual(buildTauriArgs(["dev"]), ["dev", "--features", "minacalc"]);
});

test("does not duplicate an explicit feature selection", () => {
  assert.deepEqual(
    buildTauriArgs(["build", "--features", "minacalc"]),
    ["build", "--features", "minacalc"],
  );
});

test("preserves explicit no-default-features builds", () => {
  assert.deepEqual(
    buildTauriArgs(["build", "--no-default-features"]),
    ["build", "--no-default-features"],
  );
});

test("uses the Windows shell for .cmd Tauri launchers", () => {
  assert.deepEqual(buildTauriSpawnOptions("win32"), { shell: true });
  assert.deepEqual(buildTauriSpawnOptions("darwin"), { shell: false });
});
