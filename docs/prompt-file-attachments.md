# Markdown prompt attachments

`gen --prompt-file` attaches UTF-8 `.md` or `.txt` bytes as native Responses
`input_file` content on the OAuth and API lanes. It does not concatenate the
document into the short prompt, truncate it, or change the selected model.
Repeat the flag to attach multiple documents; `--ref` remains an image reference.

```powershell
node bin/ima2.js gen "Read the attached prompt in full and generate the requested page." `
  --prompt-file D:/work/page.md --ref D:/work/character.png `
  --provider oauth --model gpt-5.6-sol --mode auto -q high -s 1024x1536 `
  --server http://127.0.0.1:3340 -o D:/work/candidate.png
```

The positional prompt is optional when files are supplied. `--stdin` may supply
a short cover instruction. Use `auto` when the model needs to interpret a long
document into an image-tool prompt; explicit `direct` keeps its existing behavior.
This feature currently covers CLI `gen` and POST `/api/generate`, not Studio UI,
`edit`, `multimode`, or other provider lanes.

Defaults: up to 8 files, 1 MiB per file, 4 MiB total. Config overrides are
`IMA2_MAX_PROMPT_FILES`, `IMA2_MAX_PROMPT_FILE_BYTES`, and
`IMA2_MAX_PROMPT_FILES_TOTAL_BYTES`. Model context and provider limits still apply.
The existing 32,000-unit short-prompt limit remains in place.

Both CLI and server must support this feature. The CLI checks
GET `/api/prompt-files` before submitting. Unsupported servers/providers fail
instead of silently dropping files or falling back to inline text. Retries retain
the attachments; the legacy prompt-only fallback is disabled for attached jobs.

Saved image metadata contains the original filename/base64 bytes in `promptFiles`
and byte counts/SHA-256 in `promptFileManifest`. Treat that metadata with the same
care as the source prompt. The server never resolves a supplied file path or URL.

## Local installation alongside production

Build this checkout with `npm ci`, `npm run build:server`, `npm run build:cli`.
Then run `pwsh -NoProfile -File scripts/start-prompt-file-server.ps1`.
The script starts the actual ima2 server with isolated config/output storage,
reuses the existing authenticated OAuth proxy, and prints the verified server URL.
It does not replace or restart the production server. Invoke this checkout's
`bin/ima2.js` with that explicit `--server` URL; the global published CLI is unchanged.

For the shared `ima2_burst30_direct.py`, use `prompt_transport: "attachment"`
in each new job, and pass this CLI with `--ima2` plus the printed URL with `--server`.
The receipt-bound `prompt_file` is attached unchanged. Existing jobs default to inline.
`New-CommunityToonIma2Jobs.ps1 -PromptTransport attachment` creates these jobs.

## Verification on 2026-09-23

- Live OAuth text probe read the final marker of a 38,451-character Markdown file.
- Live `gen` produced a PNG using a 39,135-character / 92,435-byte document and
  a 68-character cover prompt. Saved source bytes and SHA-256 matched exactly.
- The smoke output was 1254x1254 for a requested 1024x1024; attachment delivery was
  verified, not exact image-size adherence or artistic quality.
- Unit/integration coverage checks invalid files, byte limits, old-server refusal,
  native request content, no file-dropping fallback, and saved provenance.
- Server/test TypeScript checks, server/CLI builds, UI build, test inventory and
  68 CLI/auth/API compatibility tests passed. The full Windows run finished with
  3,624 passed, 22 failed, 5 skipped: remaining failures include symlink `EPERM`,
  an advertise-path test affected by isolated config, and a video fixture's
  randomly assigned port rejected by Node fetch. The full suite is not green;
  the feature's native transport and live generation checks passed.
  The advertise/health and video tests passed on a separate rerun without the
  shared isolated-config override; the symlink-permission cases remain unverified.
