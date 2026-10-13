import { test } from "node:test";
import assert from "node:assert/strict";
import { controlledGeneration } from "../bin/lib/controlled-generation.js";
import { experimentDeadline } from "../lib/experimentControl.js";

const body = () => ({ requestId: "test-controlled", controlledExperiment: true, async: true, n: 1,
  provider: "oauth", model: "gpt-6.1-sol", imageToolModel: "gpt-image-2.5-sunburst", mode: "direct",
  webSearchEnabled: false, deadlineAt: 4000, prompt: "same prompt", references: ["same ref"] });
const support = { version: 1, retries: 0, fallback: false };

test("controlled CLI retains terminal failure details rather than dropping upstream diagnostics", async () => {
  const failure = { error: "stream error", code: "RESPONSES_STREAM_ERROR", upstreamCode: "server_error", errorEventCount: 3 };
  const result = await controlledGeneration("http://local", body(), {
    now: () => 1, progress: () => {},
    call: async (_base, path) => {
      if (path === "/api/experiment-control") return support;
      if (path === "/api/generate") return { requestId: body().requestId, experiment: support };
      return { terminalJobs: [{ requestId: body().requestId, status: "error", errorCode: failure.code, meta: { failure } }] };
    },
  });
  assert.equal(result.error, failure.error);
  assert.deepEqual((result as unknown as { failure: unknown }).failure, failure);
});

test("control validation rejects implicit conditions, stale deadlines, and unsupported lanes", () => {
  assert.equal(experimentDeadline({}, 1), null);
  assert.equal(experimentDeadline(body(), 1), 4000);
  for (const patch of [{ n: 2 }, { provider: "grok" }, { imageToolModel: null }, { webSearchEnabled: undefined },
    { async: false }, { deadlineAt: 0 }, { deadlineAt: 600002 }]) {
    assert.throws(() => experimentDeadline({ ...body(), ...patch }, 1));
  }
});

test("lost POST response and failed poll never cause another generation; exact terminal ID recovers", async () => {
  let now = 1, posts = 0, polls = 0;
  const result = await controlledGeneration("http://local", body(), {
    now: () => now, sleep: async (ms) => { now += ms; }, progress: () => {}, image: async (name) => name,
    call: async (_base, path, options) => {
      if (path === "/api/experiment-control") return support;
      if (path === "/api/generate") { posts++; assert.deepEqual(options?.body, body()); throw new Error("connection lost"); }
      if (++polls === 1) throw new Error("poll unavailable");
      return { terminalJobs: [{ requestId: "unrelated", status: "error" },
        { requestId: body().requestId, status: "completed", meta: { filenames: ["bound.png"] } }] };
    },
  });
  assert.equal(posts, 1);
  assert.equal(result.experimentState, "succeeded");
  assert.equal(result.images?.[0]?.filename, "bound.png");
});

test("unsupported server fails closed before submission", async () => {
  let calls = 0;
  const result = await controlledGeneration("http://local", body(), {
    now: () => 1, call: async () => { calls++; return {}; }, progress: () => {},
  });
  assert.equal(calls, 1);
  assert.equal(result.experimentState, "not_submitted");
});

test("one shared absolute deadline cancels once; cancellation race preserves completed output", async () => {
  for (const terminal of ["canceled", "completed", "unreachable"]) {
    let now = 1, posts = 0, deletes = 0;
    const result = await controlledGeneration("http://local", body(), {
      now: () => now, sleep: async (ms) => { now += ms; }, progress: () => {}, image: async () => "pixels",
      call: async (_base, path, options) => {
        if (path === "/api/experiment-control") return support;
        if (path === "/api/generate") { posts++; return { requestId: body().requestId, experiment: support }; }
        if (options?.method === "DELETE") { deletes++; if (terminal === "unreachable") throw new Error("offline"); return {}; }
        if (!deletes) return { jobs: [{ requestId: body().requestId }] };
        return { terminalJobs: [{ requestId: body().requestId, status: terminal, meta: { filenames: ["bound.png"] } }] };
      },
    });
    assert.equal(posts, 1); assert.equal(deletes, 1); assert.equal(now, 4000);
    assert.equal(result.experimentState, terminal === "completed" ? "succeeded" : terminal === "unreachable" ? "unknown" : "canceled");
  }
});


test("24 controlled clients stay below the shared 600 per minute HTTP budget", async () => {
  let now=1, polls=0;
  await controlledGeneration("http://local", {...body(), deadlineAt:60001}, {
    now:()=>now, sleep:async(ms)=>{now+=ms;}, progress:()=>{},
    call:async(_base,path,options)=>{
      if(path==="/api/experiment-control") return support;
      if(path==="/api/generate") return {requestId:body().requestId,experiment:support};
      if(options?.method==="DELETE") return {};
      polls++;return {jobs:[{requestId:body().requestId}]};
    }
  });
  assert.ok(polls*24+120<600);
  assert.equal(now,60001);
});

test("pending work polls twice per minute and collects an early completion within 30 seconds", async () => {
  let now = 0, posts = 0, deletes = 0;
  const checks: number[] = [];
  const completedAt = 152_400;
  const result = await controlledGeneration("http://local", { ...body(), deadlineAt: 600_000 }, {
    now: () => now, sleep: async (ms) => { now += ms; }, progress: () => {}, image: async () => "pixels",
    call: async (_base, path, options) => {
      if (path === "/api/experiment-control") return support;
      if (path === "/api/generate") { posts++; return { requestId: body().requestId, experiment: support }; }
      if (options?.method === "DELETE") { deletes++; return {}; }
      checks.push(now);
      return now < completedAt ? { jobs: [{ requestId: body().requestId }] }
        : { terminalJobs: [{ requestId: body().requestId, status: "completed", meta: { filenames: ["bound.png"] } }] };
    },
  });
  assert.equal(result.experimentState, "succeeded");
  assert.equal(posts, 1); assert.equal(deletes, 0);
  assert.equal(checks[0], 0);
  assert.equal(checks.filter((time) => time < 60_000).length, 2);
  assert.ok(now >= completedAt && now - completedAt <= 30_000);
});
