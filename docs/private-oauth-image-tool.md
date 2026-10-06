# Personal OAuth image-tool experiment

This branch adds opt-in forwarding of `--image-tool-model` to the OAuth image-generation tool. Without that flag, the existing request is unchanged. OAuth quality remains low/medium/high. API behavior is unchanged.

Example: `ima2 gen --provider oauth --model gpt-6.1-sol --image-tool-model gpt-image-2.5-sunburst --quality high --mode direct ...`

Personal preset after building: `node scripts/ima2-personal.mjs gen --stdin ...`. For OAuth gen/edit it supplies GPT-6.1-Sol, Sunburst, high quality, and max reasoning unless explicitly overridden. Gen also defaults to direct mode. Other commands/providers pass through to the real CLI unchanged. It registers GPT-6.1-Sol only in its own process, matching the existing local generation-history bootstrap pattern.

`node scripts/ima2-personal.mjs serve` starts the real `startServer()` in that same process so the local model registration is also available on the server. This follows the prior local generation bootstrap and uses existing file-backed OAuth login, without an interactive setup wizard.

The reasoning model (`--model`) and image-tool model are separate request fields. The sidecar, embedded metadata, and history retain the **requested** image-tool model. They do not prove which backend actually rendered the image. Upstream errors are preserved; there is no silent fallback to a different image tool.

OAuth server support is experimental and may change. This is a personal fork change pending official support, not an upstream release. Credentials and generation artifacts must remain local.

Local probe on 2026-10-06: GPT-6.1-Sol / Sunburst / high / max reasoning, direct mode, three image references. The OAuth response was HTTP 200 and completed one image in about 58 seconds. Requested canvas 1100×1600; returned transparent RGBA PNG 1040×1513. The image-generation output item did not report a model identifier, so acceptance and completion are verified but renderer identity remains unverified.
