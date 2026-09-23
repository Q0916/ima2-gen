import { createHash } from "node:crypto";
import { config } from "../config.js";

export interface PromptFile { filename: string; data: string }
export interface PromptFileLimits { maxCount: number; maxFileBytes: number; maxTotalBytes: number }

export function requirePromptFileMode(files: PromptFile[], mode: unknown): void {
  if (files.length && mode === "direct") {
    throw Object.assign(new Error("Prompt files require --mode auto: direct copies the cover text instead of composing the attached scene."),
      { code: "PROMPT_FILES_REQUIRE_AUTO", status: 400 });
  }
}

export const PROMPT_FILE_COMPOSITION_INSTRUCTION =
  "Attached input_file documents contain the actual image request. Read them in full before calling image_generation. " +
  "For this document-based request, preserving the user's prompt means preserving the substantive instructions in those documents, not copying the short cover message. " +
  "Compose a self-contained image_generation prompt describing the requested scene, actions, composition, style, reference roles and exact visible text from the documents. " +
  "The image tool cannot follow a pointer such as 'read the attachment'; put the actual visual instructions into its prompt. " +
  "Respect the document's requested output scope and distinguish background context from what belongs in this image. " +
  "Use reference images in the roles specified by the document; their layout is not automatically the requested output layout. " +
  "Cover-message tracking IDs and filenames are metadata, not visible text unless the document explicitly requests them.";

export function promptFileLimits(): PromptFileLimits {
  return { maxCount: config.limits.maxPromptFiles, maxFileBytes: config.limits.maxPromptFileBytes,
    maxTotalBytes: config.limits.maxPromptFilesTotalBytes };
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: "INVALID_PROMPT_FILE", status: 400 });
}

/** No paths/URLs are resolved on the server; clients supply exact UTF-8 file bytes. */
export function validatePromptFiles(value: unknown, limits = promptFileLimits()): PromptFile[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limits.maxCount) invalid("Invalid prompt file count.");
  let total = 0;
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") invalid("Invalid prompt file object.");
    const { filename, data } = item as Record<string, unknown>;
    if (typeof filename !== "string" || filename.length > 200 || /[\\/\x00-\x1f\x7f]/.test(filename)
      || !/^.+\.(md|txt)$/i.test(filename)) invalid("Prompt files must be named .md or .txt files.");
    if (typeof data !== "string" || data.length > Math.ceil(limits.maxFileBytes / 3) * 4
      || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      invalid("Invalid or oversized prompt file data.");
    }
    const bytes = Buffer.from(data, "base64");
    total += bytes.length;
    if (!bytes.length || bytes.length > limits.maxFileBytes || total > limits.maxTotalBytes
      || bytes.toString("base64") !== data) invalid("Prompt file byte limit exceeded or data invalid.");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { invalid("Prompt files must contain valid UTF-8 text."); }
    if (!text.trim() || text.includes("\0")) invalid("Prompt files must contain nonempty text.");
    return { filename, data };
  });
}

export function promptFileInputs(files: PromptFile[] = []) {
  return files.map(({ filename, data }) => ({ type: "input_file" as const, filename,
    file_data: `data:${/\.md$/i.test(filename) ? "text/markdown" : "text/plain"};base64,${data}` }));
}

export function promptFileManifest(files: PromptFile[]) {
  return files.map(({ filename, data }) => {
    const bytes = Buffer.from(data, "base64");
    return { filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      transport: "input_file" as const };
  });
}
