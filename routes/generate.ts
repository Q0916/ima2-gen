import type { Express } from "express";
import { promptFileLimits } from "../lib/promptFiles.js";
import { runGeneratePipeline } from "../lib/generatePipeline.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { normalizePresetIds } from "../lib/presetCompiler.js";

export function registerGenerateRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.get("/api/prompt-files", (_req, res) => res.json({ transport: "input_file", providers: ["oauth", "api"], modes: ["auto"], extensions: [".md", ".txt"], limits: promptFileLimits() }));
  app.post("/api/generate", (req, res) => {
    req.body = { ...req.body, presetIds: normalizePresetIds(req.body?.presetIds) };
    return runGeneratePipeline(req, res, ctx);
  });
}
