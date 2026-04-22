import { readFile, stat, writeFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { resolveProjectFile } from "./files";

export class FilePatchError extends Error {
  readonly code:
    | "file_not_found"
    | "not_a_file"
    | "unsupported_file"
    | "node_not_found";

  constructor(code: FilePatchError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface PatchHtmlNodeInput {
  node_bg_id: string;
  text?: string;
  attributes?: Record<string, string | null>;
  /** Inline-style merge patch; null removes a property. See PatchFileRequest. */
  styles?: Record<string, string | null>;
}

export interface PatchHtmlNodeResult {
  absolutePath: string;
  updatedAt: number;
}

/**
 * Edits a single node in a project HTML file, keyed by its
 * `data-bg-node-id` attribute. Only the targeted node's text / attributes
 * are rewritten; the rest of the document (including whitespace) is
 * preserved by node-html-parser's tree serializer.
 */
export async function patchHtmlNode(
  projectId: string,
  relPath: string,
  input: PatchHtmlNodeInput,
): Promise<PatchHtmlNodeResult> {
  const resolved = await resolveProjectFile(projectId, relPath);
  if (!resolved) {
    throw new FilePatchError("file_not_found", `File not found: ${relPath}`);
  }

  const info = await stat(resolved.absolutePath).catch(() => null);
  if (!info || !info.isFile()) {
    throw new FilePatchError("not_a_file", `Not a file: ${relPath}`);
  }

  const lower = relPath.toLowerCase();
  if (!(lower.endsWith(".html") || lower.endsWith(".htm"))) {
    throw new FilePatchError(
      "unsupported_file",
      "Only .html files are editable in Edit mode",
    );
  }

  const html = await readFile(resolved.absolutePath, "utf8");
  const output = applyHtmlNodePatch(html, input);
  await writeFile(resolved.absolutePath, output, "utf8");
  return { absolutePath: resolved.absolutePath, updatedAt: Date.now() };
}

/**
 * Pure HTML rewrite: serialize a patched DOM tree, preserving everything
 * except the target node's text/attributes. Exposed separately so it can
 * be exercised by unit tests without touching the filesystem or the DB.
 */
export function applyHtmlNodePatch(
  html: string,
  input: PatchHtmlNodeInput,
): string {
  const root = parse(html);
  const selector = `[data-bg-node-id="${escapeAttrSelector(input.node_bg_id)}"]`;
  const target = root.querySelector(selector);
  if (!target) {
    throw new FilePatchError(
      "node_not_found",
      `No element with data-bg-node-id="${input.node_bg_id}"`,
    );
  }

  if (input.text !== undefined) {
    target.set_content(escapeHtmlText(input.text));
  }

  if (input.attributes) {
    for (const [name, value] of Object.entries(input.attributes)) {
      if (name === "data-bg-node-id") {
        // The anchor is immutable — editing it would orphan the pin and
        // break every follow-up PATCH. Silently ignore.
        continue;
      }
      if (value === null) {
        target.removeAttribute(name);
      } else {
        target.setAttribute(name, value);
      }
    }
  }

  if (input.styles) {
    const current = parseInlineStyle(target.getAttribute("style") ?? "");
    for (const [prop, value] of Object.entries(input.styles)) {
      const key = prop.trim();
      if (!key) continue;
      if (value === null) {
        delete current[key];
      } else {
        current[key] = value;
      }
    }
    const serialized = serializeInlineStyle(current);
    if (serialized.length === 0) {
      target.removeAttribute("style");
    } else {
      target.setAttribute("style", serialized);
    }
  }

  return root.toString();
}

/**
 * Parse a `style="..."` attribute string into an ordered map. Naive — assumes
 * property values don't contain bare `:` or `;`. Tweaks mode emits
 * well-behaved values (px / rem / rgba / hex / keywords), so this is good
 * enough. If a future slice needs complex values (url(...), var(...), etc.)
 * this can be upgraded or replaced with a proper CSS parser.
 */
export function parseInlineStyle(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of raw.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

export function serializeInlineStyle(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttrSelector(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
