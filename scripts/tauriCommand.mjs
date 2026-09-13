export function buildTauriArgs(args) {
  const command = args[0];
  const hasFeatureSelection = args.includes("--features") || args.includes("--no-default-features");

  if ((command === "dev" || command === "build") && !hasFeatureSelection) {
    return [...args, "--features", "minacalc"];
  }

  return args;
}

export function buildTauriSpawnOptions(platform = process.platform) {
  return { shell: platform === "win32" };
}
