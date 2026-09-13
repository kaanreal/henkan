export function buildTauriArgs(args) {
  const command = args[0];
  const hasFeatureSelection = args.includes("--features") || args.includes("--no-default-features");

  if ((command === "dev" || command === "build") && !hasFeatureSelection) {
    return [...args, "--features", "minacalc"];
  }

  return args;
}
