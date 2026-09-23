import { open } from "node:fs/promises";
import { basename } from "node:path";
import { validatePromptFiles, promptFileLimits, type PromptFile } from "../../lib/promptFiles.js";
import { request } from "./client.js";

export async function loadPromptFiles(paths: string[]): Promise<PromptFile[]> {
  const limits = promptFileLimits();
  if (paths.length > limits.maxCount) throw new Error(`At most ${limits.maxCount} prompt files allowed.`);
  const files: PromptFile[] = [];
  for (const path of paths) {
    const handle = await open(path, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limits.maxFileBytes) throw new Error("Prompt file is not a bounded regular file.");
      const buffer = Buffer.alloc(limits.maxFileBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > limits.maxFileBytes) throw new Error("Prompt file grew beyond its byte limit.");
      files.push({ filename: basename(path), data: buffer.subarray(0, length).toString("base64") });
    } finally { await handle.close(); }
  }
  return validatePromptFiles(files, limits);
}

export async function requirePromptFileSupport(base: string): Promise<void> {
  try {
    const result = await request(base, "/api/prompt-files", { timeoutMs: 10000 });
    if (result?.transport !== "input_file") throw new Error("Unsupported server.");
  } catch {
    throw Object.assign(new Error("This server does not advertise Markdown prompt attachments; update/start the matching server. No generation was submitted."),
      { code: "PROMPT_FILES_UNSUPPORTED", status: 400 });
  }
}
