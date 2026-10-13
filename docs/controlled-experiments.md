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

## Failure diagnosis and time limits

The shared experiment deadline and the OAuth provider's per-call timeout are
separate limits; whichever expires first stops the request. OAuth defaults to
400000 ms. Setting a 600000 ms experiment deadline does not raise that limit.
For a dedicated ten-minute diagnostic server, set
`IMA2_OAUTH_GENERATION_TIMEOUT_MS=590000` in that server process before startup.
Keep the absolute batch deadline and record both values with the experiment.
Do not infer an upstream outage or access denial from a locally generated 504.

Terminal failures retain the structured `failure` payload, which the controlled
CLI returns alongside `code` and `error`. `RESPONSES_IMAGE_TIMEOUT` identifies a
local provider-call timeout. Stream failures retain event counts and sanitized
output-item summaries, including whether an image tool call started before the
stream failed. These diagnostics contain types, statuses and lengths, not prompt
text or image bytes. A tool-start event proves entry into the image tool, not
successful completion; a successful PNG proves a working request, not reliability
under a different concurrency level or visual correctness.

Validation: controlled-generation and controlled-execution tests, plus the classic
async route regression, use fake providers. No real image generation is needed.
