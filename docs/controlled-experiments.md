# Controlled prompt experiments

Opt in with `ima2 gen --controlled-experiment --deadline-at <epoch-ms>`.
Use the ordinary CLI/provider route with explicit `--provider oauth|api`, `--model`,
`--image-tool-model`, `--mode`, `--web-search|--no-web-search`, and `-n 1`.
An optional `--request-id` lets a batch launcher persist request identity before submission.
The launcher supplies one shared future deadline (maximum 600000 ms away) to all jobs.
This mode does not use the ordinary per-request `--timeout` as a new budget.

The server must advertise `/api/experiment-control` version 1; unsupported servers
are rejected before submission. The CLI submits one async request, then reads
inflight/terminal status by request ID. It never replays a POST after a lost response.
The local generated-image directory must match the server's storage configuration.
Output recovery reads only filenames bound to the exact terminal request.

Controlled requests disable the classic OpenAI adapter's retry and prompt-only
fallback. The server aborts at the absolute deadline independently of CLI liveness.
Cancellation/status cleanup can take up to ten seconds after that deadline, but
does not extend provider execution. A local abort is not proof of remote GPU cessation.

CLI JSON exposes `experimentState`: pending, succeeded, failed, canceled, unknown,
or not_submitted. Unknown transport outcomes are not evidence of provider failure.
Acknowledgement, terminal metadata and image sidecars retain the effective input
fingerprint; the CLI also records the submitted body fingerprint. Ordinary requests
retain their existing behavior. Provider-internal randomness/routing is outside this control.

Validation: controlled-generation and controlled-execution tests, plus the classic
async route regression, use fake providers. No real image generation is needed.
