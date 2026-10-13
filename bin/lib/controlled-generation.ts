import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { config } from "../../config.js";
import { experimentDeadline, experimentFingerprint } from "../../lib/experimentControl.js";
import { request } from "./client.js";

type State = "pending" | "succeeded" | "failed" | "canceled" | "unknown" | "not_submitted";
type Result = { requestId: string; experimentState: State; experiment: Record<string, unknown>;
  images?: { image: string; filename: string }[]; code?: string; error?: string };
type Dependencies = {
  call: typeof request;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  image: (filename: string) => Promise<string>;
  progress: (value: Record<string, unknown>) => void;
};
const defaults: Dependencies = {
  call: request, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  image: async (filename) => {
    if (basename(filename) !== filename) throw new Error("Invalid output filename");
    const data = await readFile(join(config.storage.generatedDir, filename));
    return `data:application/octet-stream;base64,${data.toString("base64")}`;
  },
  progress: (value) => { process.stderr.write(JSON.stringify(value) + "\n"); },
};

// Exactly one submission. Poll failures are unknown, never a new generation.
export async function controlledGeneration(base: string, body: Record<string, unknown>,
  overrides: Partial<Dependencies> = {}): Promise<Result> {
  const d = { ...defaults, ...overrides };
  const requestId = String(body.requestId);
  const deadline = experimentDeadline(body, d.now())!;
  const experiment: Record<string, unknown> = { version: 1, deadlineAt: deadline,
    submittedBodySha256: experimentFingerprint(body) };
  const result = (state: State, extra = {}): Result => ({ requestId, experimentState: state, experiment, ...extra });
  const timeout = () => Math.max(1, Math.min(5000, deadline - d.now()));
  try {
    const support = await d.call(base, "/api/experiment-control", { timeoutMs: timeout() });
    if (support.version !== 1 || support.retries !== 0 || support.fallback !== false) throw new Error("Server does not support controlled experiments");
  } catch (error) { return result("not_submitted", { code: "EXPERIMENT_CONTROL_UNAVAILABLE", error: String(error) }); }
  if (d.now() >= deadline) return result("not_submitted", { code: "BATCH_DEADLINE" });
  let lastState: State = "unknown";
  try {
    const accepted = await d.call(base, "/api/generate", { method: "POST", body,
      timeoutMs: timeout(), headers: { "X-Request-Id": requestId } });
    if (accepted.requestId !== requestId || accepted.experiment?.version !== 1) {
      throw new Error("Missing controlled-experiment acknowledgement");
    }
    Object.assign(experiment, accepted.experiment);
    lastState = "pending";
    d.progress({ requestId, experimentState: lastState, experiment });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status && status >= 400 && status < 500) return result("failed", { error: String(error) });
    d.progress({ requestId, experimentState: "unknown", error: String(error) });
  }
  const inspect = async (timeoutMs: number): Promise<Result | null> => {
    const snapshot = await d.call(base, "/api/inflight?includeTerminal=1", { timeoutMs });
    const terminal = snapshot.terminalJobs?.find((j: { requestId: string }) => j.requestId === requestId);
    if (terminal?.meta?.experiment?.version === 1) Object.assign(experiment, terminal.meta.experiment);
    if (terminal?.status === "canceled") return result("canceled", { code: terminal.errorCode });
    if (terminal?.status === "error") return result("failed", {
      code: terminal.errorCode, error: terminal.meta?.failure?.error,
      failure: terminal.meta?.failure,
    });
    if (terminal?.status === "completed") {
      const filenames = terminal.meta?.filenames ?? (terminal.meta?.filename ? [terminal.meta.filename] : []);
      if (filenames.length !== 1) return result("unknown", { code: "OUTPUT_IDENTITY_MISSING" });
      const filename = String(filenames[0]);
      return result("succeeded", { images: [{ filename, image: await d.image(filename) }] });
    }
    lastState = snapshot.jobs?.some((j: { requestId: string }) => j.requestId === requestId) ? "pending" : "unknown";
    return null;
  };
  while (d.now() < deadline) {
    try { const done = await inspect(timeout()); if (done) return done; }
    catch { lastState = "unknown"; }
    await d.sleep(Math.max(0, Math.min(1000, deadline - d.now())));
  }
  // Short cleanup window does not extend provider execution's server-side deadline.
  try {
    await d.call(base, `/api/inflight/${encodeURIComponent(requestId)}`, { method: "DELETE", timeoutMs: 5000 });
    const done = await inspect(5000);
    if (done) return done;
  } catch { lastState = "unknown"; }
  return result(lastState, { code: "BATCH_DEADLINE", error: "Deadline reached; terminal state could not be confirmed. Do not resubmit." });
}
