import { createHash } from "node:crypto";

export const EXPERIMENT_CONTROL_VERSION = 1;
export const EXPERIMENT_MAX_MS = 600_000;

// Opt-in only. Reject unsupported lanes/options before any provider work.
export function experimentDeadline(body: Record<string, unknown>, now = Date.now()): number | null {
  if (body.controlledExperiment === undefined || body.controlledExperiment === false) return null;
  const deadline = body.deadlineAt;
  if (body.controlledExperiment !== true || body.async !== true || body.n !== 1
      || !["oauth", "api"].includes(String(body.provider))
      || !["auto", "direct"].includes(String(body.mode))
      || !body.model || !body.imageToolModel || typeof body.webSearchEnabled !== "boolean"
      || typeof deadline !== "number" || !Number.isSafeInteger(deadline)
      || deadline <= now || deadline > now + EXPERIMENT_MAX_MS) {
    throw Object.assign(new Error("Controlled experiments require async, n=1, explicit OpenAI provider/model/imageToolModel/mode/webSearchEnabled and a future deadline within 10 minutes"),
      { status: 400, code: "EXPERIMENT_CONTROL_INVALID" });
  }
  return deadline;
}

export function experimentFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
