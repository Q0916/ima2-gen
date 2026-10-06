import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPersonalImagePreset } from "../lib/personalPreset.ts";

test("personal OAuth preset separates reasoning and image models", () => {
  const args = applyPersonalImagePreset(["gen", "--stdin"]);
  for (const [key, value] of [["--model", "gpt-6.1-sol"], ["--image-tool-model", "gpt-image-2.5-sunburst"],
    ["--quality", "high"], ["--reasoning-effort", "max"], ["--mode", "direct"]]) {
    assert.equal(args[args.indexOf(key!) + 1], value);
  }
});
test("personal preset honors explicit choices including short quality and option terminator", () => {
  const args = applyPersonalImagePreset(["gen", "-q", "low", "--model=gpt-5.4", "--mode", "auto", "--", "--quality"]);
  assert.equal(args.filter(arg => arg === "--quality").length, 1);
  assert.ok(args.includes("--model=gpt-5.4"));
  assert.equal(args[args.indexOf("--mode") + 1], "auto");
  assert.deepEqual(args.slice(args.indexOf("--")), ["--", "--quality"]);
});
test("personal preset leaves unrelated providers and commands unchanged", () => {
  for (const args of [["serve"], ["gen", "--provider=api"], ["gen", "--provider", "grok"], ["models"]]) {
    assert.deepEqual(applyPersonalImagePreset(args), args);
  }
});
test("edit preset leaves its existing prompt mode default alone", () => {
  const args = applyPersonalImagePreset(["edit", "source.png", "--prompt", "edit"]);
  assert.ok(args.includes("gpt-image-2.5-sunburst"));
  assert.equal(args.includes("--mode"), false);
});
