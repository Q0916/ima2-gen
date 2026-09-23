import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePromptFiles, promptFileInputs, promptFileManifest } from "../lib/promptFiles.ts";
import { loadPromptFiles, requirePromptFileSupport } from "../bin/lib/prompt-files.ts";
import { generateViaResponses } from "../lib/responsesImageAdapter.ts";
import { config } from "../config.js";

const text = "# 한국어 콘티\r\n" + "손끝의 동작을 보존한다.\n".repeat(3000);
const doc = { filename: "콘티.md", data: Buffer.from(text).toString("base64") };

test("Markdown attachments preserve >32K Korean text bytes independently of the short prompt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ima2-md-"));
  try {
    const path = join(dir, doc.filename);
    await writeFile(path, Buffer.from(text));
    const files = await loadPromptFiles([path]);
    assert.deepEqual(files, [doc]);
    const inputs = promptFileInputs(files);
    assert.equal(inputs[0]?.type, "input_file");
    assert.equal(inputs[0]?.file_data, "data:text/markdown;base64," + doc.data);
    assert.equal(promptFileManifest(files)[0]?.bytes, Buffer.byteLength(text));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("invalid attachments fail before submission", () => {
  for (const value of [null, {}, [{ ...doc, filename: "../secret.md" }],
    [{ ...doc, filename: "x.png" }], [{ ...doc, data: "%%%" }],
    [{ ...doc, data: Buffer.from([255]).toString("base64") }],
    [{ ...doc, data: Buffer.from("\0").toString("base64") }],
    [{ ...doc, data: "" }]]) {
    assert.throws(() => validatePromptFiles(value), { code: "INVALID_PROMPT_FILE" });
  }
  assert.throws(() => validatePromptFiles([doc], { maxCount: 1, maxFileBytes: 10, maxTotalBytes: 10 }));
  const small = { filename: "a.txt", data: Buffer.from("abcd").toString("base64") };
  assert.throws(() => validatePromptFiles([small, small], { maxCount: 2, maxFileBytes: 4, maxTotalBytes: 7 }));
  assert.throws(() => validatePromptFiles([small, small], { maxCount: 1, maxFileBytes: 4, maxTotalBytes: 8 }));
});

test("old servers cannot silently ignore --prompt-file", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  try { await assert.rejects(requirePromptFileSupport("http://127.0.0.1:1"), { code: "PROMPT_FILES_UNSUPPORTED" }); }
  finally { globalThis.fetch = original; }
});

test("Responses generation sends native files and never retries without them", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const content = body.input.find((x: { role: string }) => x.role === "user").content;
    assert.equal(content.find((x: { type: string }) => x.type === "input_file").file_data,
      "data:text/markdown;base64," + doc.data);
    assert(!content.find((x: { type: string }) => x.type === "input_text").text.includes(text));
    assert.match(content.find((x: { type: string }) => x.type === "input_text").text, /self-contained image_generation prompt/);
    assert.match(body.input[0].content, /not copying the short cover message/);
    assert.doesNotMatch(content.find((x: { type: string }) => x.type === "input_text").text, /exact prompt, no modifications/);
    return new Response('data: {"type":"response.completed","response":{"output":[]}}\n\n',
      { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    await assert.rejects(generateViaResponses("api", "Draw the attached scene", "low", "1024x1536", "low", [],
      null, "auto", { config, apiKey: "sk-test" }, { promptFiles: [doc], webSearchEnabled: false, allowPromptOnlyOAuthFallback: true }));
    assert.equal(calls, 1);
    await assert.rejects(generateViaResponses("api", "tracking-id", "low", "1024x1536", "low", [],
      null, "direct", { config, apiKey: "sk-test" }, { promptFiles: [doc] }), { code: "PROMPT_FILES_REQUIRE_AUTO" });
    assert.equal(calls, 1, "invalid mode must never submit upstream");
  } finally { globalThis.fetch = original; }
});
