import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
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

  // Capture pre-patch content for the in-memory file-level undo (audit
  // fix #7). Stored before the rename so the undo entry is consistent
  // even if the write itself throws.
  rememberPatchedFile(projectId, relPath, html);

  await atomicWriteFile(resolved.absolutePath, output);
  return { absolutePath: resolved.absolutePath, updatedAt: Date.now() };
}

/**
 * Single-step in-memory undo for GUI-driven patches (Edit + Tweaks).
 * Cross-turn rollback is already covered by the per-turn checkpoint
 * snapshot system; this fills the gap between turns where the user
 * may make a series of small edits without ever sending a chat
 * message. Cleared on backend restart by design — undo is a same-
 * session affordance.
 *
 * One entry per (projectId, relPath); a second patch evicts the
 * first, mirroring how the Tweaks Cmd/Ctrl+Z stack used to behave at
 * the inline-style level (P3.12).
 */
interface UndoEntry {
  content: string;
  storedAt: number;
}

const undoStore = new Map<string, UndoEntry>();

function undoKey(projectId: string, relPath: string): string {
  return `${projectId}::${relPath}`;
}

function rememberPatchedFile(
  projectId: string,
  relPath: string,
  preContent: string,
): void {
  undoStore.set(undoKey(projectId, relPath), {
    content: preContent,
    storedAt: Date.now(),
  });
}

export interface FileUndoState {
  can_undo: boolean;
  stored_at: number | null;
}

export function getFileUndoState(
  projectId: string,
  relPath: string,
): FileUndoState {
  const entry = undoStore.get(undoKey(projectId, relPath));
  return entry
    ? { can_undo: true, stored_at: entry.storedAt }
    : { can_undo: false, stored_at: null };
}

export async function undoLastFilePatch(
  projectId: string,
  relPath: string,
): Promise<{ absolutePath: string; updatedAt: number } | null> {
  const key = undoKey(projectId, relPath);
  const entry = undoStore.get(key);
  if (!entry) return null;
  const resolved = await resolveProjectFile(projectId, relPath);
  if (!resolved) {
    // Stale entry — file vanished. Drop it so the UI stops offering Undo.
    undoStore.delete(key);
    return null;
  }
  await atomicWriteFile(resolved.absolutePath, entry.content);
  undoStore.delete(key);
  return { absolutePath: resolved.absolutePath, updatedAt: Date.now() };
}

/**
 * Test helper. Clears all stored undo entries so tests do not leak
 * state between runs. Not part of the public route surface.
 */
export function __resetFilePatchUndoStoreForTests(): void {
  undoStore.clear();
}

/**
 * Writes via tempfile + rename so a process crash mid-write can never
 * leave half a file on disk. The rename is atomic on POSIX and on
 * Windows (ReplaceFile) for files on the same volume — which is always
 * the case here since the temp file is a sibling of the target.
 *
 * Best-effort temp cleanup if the rename throws.
 */
async function atomicWriteFile(
  absolutePath: string,
  contents: string,
): Promise<void> {
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath);
  const tmp = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, absolutePath);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      // Ignore — the tempfile may not have been created yet.
    }
    throw err;
  }
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
 * Parse a `style="..."` attribute string into an ordered map.
 *
 * Tweaks mode emits well-behaved short values (px / rem / rgba / hex /
 * keywords) but Edit mode lets the user paste arbitrary inline styles,
 * which can include declarations whose value carries `;` or `:` inside
 * a function call or string — `background: url(data:image/png;base64,…)`,
 * `background: linear-gradient(red, blue)`, `color: var(--x, fallback)`,
 * `font-family: "Helvetica Neue, sans"`, etc.
 *
 * The parser is a tiny state machine: split on `;` only when paren
 * depth is zero AND we're outside a quoted string. Keys are still
 * separated from values by the first top-level `:`, which is safe
 * because CSS property names cannot contain `:` or `(`.
 */
export function parseInlineStyle(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = "";

  const commit = () => {
    const trimmed = buf.trim();
    buf = "";
    if (!trimmed) return;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!key || !value) return;
    out[key] = value;
  };

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === "(") {
        depth += 1;
        buf += ch;
        continue;
      }
      if (ch === ")") {
        if (depth > 0) depth -= 1;
        buf += ch;
        continue;
      }
      if (ch === ";" && depth === 0) {
        commit();
        continue;
      }
    }
    buf += ch;
  }
  commit();
  return out;
}

export function serializeInlineStyle(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

/**
 * Escapes an arbitrary string so it is safe to drop between HTML tags
 * via `set_content`. We escape quotes too even though they do not need
 * escaping in text content — the function is named generically and a
 * future caller might splice the result into an attribute by mistake.
 * Defense in depth, no behavioural change for the current call site.
 */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttrSelector(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
