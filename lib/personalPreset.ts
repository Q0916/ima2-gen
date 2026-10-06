/** Opt-in CLI profile; preserve explicit caller choices and unrelated commands. */
export function applyPersonalImagePreset(input: string[]) {
  const separator = input.indexOf("--");
  const args = separator < 0 ? [...input] : input.slice(0, separator);
  const tail = separator < 0 ? [] : input.slice(separator);
  const option = (flag: string, alias?: string) => args.findIndex(arg =>
    arg === flag || arg.startsWith(`${flag}=`) || Boolean(alias && (arg === alias || arg.startsWith(`${alias}=`))));
  const providerIndex = option("--provider");
  const provider = providerIndex < 0 ? "oauth" : args[providerIndex]!.includes("=")
    ? args[providerIndex]!.split("=")[1] : args[providerIndex + 1];
  if (!["gen", "edit"].includes(args[0]!) || provider !== "oauth") return [...input];
  for (const [flag, value, alias] of [["--provider", "oauth"], ["--model", "gpt-6.1-sol"],
    ["--image-tool-model", "gpt-image-2.5-sunburst"], ["--quality", "high", "-q"], ["--reasoning-effort", "max"]]) {
    if (option(flag!, alias) < 0) args.push(flag!, value!);
  }
  if (args[0] === "gen" && option("--mode") < 0) args.push("--mode", "direct");
  return [...args, ...tail];
}
