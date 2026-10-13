import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { RuntimeContext } from "../lib/runtimeContext.js";
import type { OpenaiRequest } from "../lib/providers/adapters/openaiExecution.js";

test("controlled OAuth empty/timeout responses get one attempt, intact references/model, no fallback", async () => {
  let calls: unknown[][] = [];
  let timeout = false;
  const stub = mock.module(new URL("../lib/providers/adapters/openaiOperations.ts", import.meta.url).href, {
    namedExports: {
      generateViaResponses: async (...args: unknown[]) => {
        calls.push(args);
        if (timeout) throw Object.assign(new Error("upstream timeout"), { status: 504 });
        return { b64: "" };
      },
      editViaResponses: () => { throw new Error("Unexpected edit"); },
      generateMultimodeViaResponses: () => { throw new Error("Unexpected multimode"); },
    },
  });
  try {
    const { prepareOpenaiExecution } = await import("../lib/providers/adapters/openaiExecution.ts");
    const refs = [{ b64: "ref-bytes", declaredMime: "image/png", detectedMime: "image/png" }];
    const request = { surface: "classic", provider: "oauth", requestId: "controlled-adapter-test",
      signal: new AbortController().signal, prompt: "same", rawPrompt: "same", references: refs,
      background: null, backgroundConstraint: undefined, providerUrl: null, nai: {}, comfy: {},
      options: { model: "gpt-6.1-sol", imageToolModel: "gpt-image-2.5-sunburst", quality: "high",
        size: "1024x1024", moderation: "low", mode: "direct", reasoningEffort: "max",
        webSearchEnabled: false, controlledExperiment: true } } as OpenaiRequest;
    for (timeout of [false, true]) {
      calls = [];
      const execution = await prepareOpenaiExecution({} as RuntimeContext, request);
      await assert.rejects(() => execution.execute());
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0]?.[5], refs);
      const options = calls[0]?.[9] as Record<string, unknown>;
      assert.equal(options.imageToolModel, "gpt-image-2.5-sunburst");
      assert.equal(options.allowPromptOnlyOAuthFallback, false);
    }
    request.options.controlledExperiment = false;
    calls = [];
    const normal = await prepareOpenaiExecution({} as RuntimeContext, request);
    await assert.rejects(() => normal.execute());
    assert.equal(calls.length, 2, "normal production keeps its existing retry policy");
  } finally { stub.restore(); }
});
