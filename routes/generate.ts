import type { Express } from "express";
import { promptFileLimits } from "../lib/promptFiles.js";
import { runGeneratePipeline } from "../lib/generatePipeline.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { normalizePresetIds } from "../lib/presetCompiler.js";
import { EXPERIMENT_CONTROL_VERSION } from "../lib/experimentControl.js";

export function registerGenerateRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.get("/api/experiment-control", (_req, res) => res.json({ version: EXPERIMENT_CONTROL_VERSION, maxBatchMs: 600000, retries: 0, fallback: false }));
  app.get("/api/prompt-files", (_req, res) => res.json({ transport: "input_file", providers: ["oauth", "api"], modes: ["auto"], extensions: [".md", ".txt"], limits: promptFileLimits() }));
  app.post("/api/generate", (req, res) => {
    req.body = { ...req.body, presetIds: normalizePresetIds(req.body?.presetIds) };
    return runGeneratePipeline(req, res, ctx);
  });
}
