import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UserEvent } from "@bg/shared";
import type { buildSessionContext } from "../services/context";
import {
  attachmentExtractedTextPath,
  attachmentSummaryPath,
} from "../services/attachments";
import {
  readUploadManifest,
  type UploadManifest,
} from "../services/design-system-extract";
import { DECK_SKILL_MD } from "./skills/deck-skill";
import { PROTOTYPE_SKILL_MD } from "./skills/prototype-skill";
import {
  summarizeDeckHtml,
  summarizePrototypeHtml,
} from "./structure-extractor";

type SessionContext = NonNullable<Awaited<ReturnType<typeof buildSessionContext>>>;

const MAX_FILES_LISTED = 60;
const MAX_SKILL_CHARS = 4000;
const MAX_TOKENS_CSS_LINES = 150;
const MAX_README_LINES = 120;
const MAX_ATTACHMENT_PAGES = 4;

export type PromptContextMode = "compact" | "full";

export interface PromptBuildOptions {
  contextMode?: PromptContextMode;
}

/**
 * Builds the prompt text piped into the LLM CLI's stdin.
 * Mirrors doc/03-backend-adapters.md section 5.4 at a Phase 1 minimum: project state,
 * design system (SKILL.md + tokens CSS + README), attachments, user request.
 */
export async function buildPrompt(
  context: SessionContext,
  userEvent: Extract<UserEvent, { type: "user.message" }>,
  options: PromptBuildOptions = {},
): Promise<string> {
  const lines: string[] = [];
  const project = context.project;
  const contextMode = options.contextMode ?? "full";

  lines.push("# BurnGuard Design project session");
  lines.push("");

  lines.push("## Context budget");
  if (contextMode === "compact") {
    lines.push(
      "- Keep this turn token-light: use the file list and paths below as an index, then Read/Grep only the exact files or sections needed.",
    );
    lines.push(
      "- Do not paste entire large HTML, CSS, PPTX, PDF, or extracted-text files back into chat; summarize findings and edit targeted regions.",
    );
    lines.push(
      "- If the user asks to redesign or continue existing work, inspect the current entrypoint and nearby CSS first, then make focused edits.",
    );
  } else {
    lines.push(
      "- Full context mode is enabled, so stable project instructions and design-system excerpts are inlined below.",
    );
  }
  lines.push("");
  lines.push(
    "You are working inside a local project directory. Every file you Write or Edit will be rendered live in a canvas iframe in the BurnGuard Design app. Use the pre-installed toolset (Read/Write/Edit/Glob/Grep/Bash) to create the artifact.",
  );
  lines.push("");

  lines.push("## Project");
  lines.push(`- id: ${project.project_id}`);
  lines.push(`- name: ${project.project_name}`);
  lines.push(`- type: ${project.project_type}`);
  lines.push(`- entrypoint: ${project.entrypoint}`);
  lines.push(`- directory: ${project.project_dir}`);
  if (project.project_type === "slide_deck") {
    const slideDeckOptions = parseSlideDeckOptions(project.options_json);
    lines.push(
      `- use_speaker_notes: ${slideDeckOptions.use_speaker_notes ? "true" : "false"}`,
    );
  }
  lines.push("");

  // Structural summary of the entrypoint, when it's an HTML artifact we know
  // how to parse. This is the main lever against runaway prompt-cache growth:
  // Claude can plan from the map and then issue 1-2 surgical Reads instead of
  // re-reading the full 100 KB+ file 6-8 times in a single agent loop.
  if (
    project.entrypoint.toLowerCase().endsWith(".html") &&
    (project.project_type === "slide_deck" ||
      project.project_type === "prototype")
  ) {
    const entrypointPath = path.isAbsolute(project.entrypoint)
      ? project.entrypoint
      : path.join(project.project_dir, project.entrypoint);
    const summary =
      project.project_type === "slide_deck"
        ? await summarizeDeckHtml(entrypointPath)
        : await summarizePrototypeHtml(entrypointPath);
    if (summary) {
      lines.push(
        project.project_type === "slide_deck"
          ? "## Deck structure (use this map; only Read sections you must change)"
          : "## Prototype structure (use this map; only Read sections you must change)",
      );
      lines.push(summary);
      lines.push("");
    }
  }

  if (context.files.length > 0) {
    lines.push("## Current files");
    for (const f of context.files.slice(0, MAX_FILES_LISTED)) {
      const size =
        typeof f.size_bytes === "number" && f.size_bytes != null
          ? ` (${f.size_bytes}B)`
          : "";
      lines.push(`- ${f.rel_path}${size}`);
    }
    if (context.files.length > MAX_FILES_LISTED) {
      lines.push(`- ... and ${context.files.length - MAX_FILES_LISTED} more`);
    }
    lines.push("");
  }

  if (context.designSystem) {
    const ds = context.designSystem;
    lines.push("## Design system");
    lines.push(`- name: ${ds.name}`);
    lines.push(`- directory: ${ds.dir_path}`);
    if (ds.skill_md_path) lines.push(`- skill: ${ds.skill_md_path}`);
    if (ds.tokens_css_path) lines.push(`- tokens: ${ds.tokens_css_path}`);
    if (ds.readme_md_path) lines.push(`- readme: ${ds.readme_md_path}`);
    lines.push("");

    if (contextMode === "compact") {
      lines.push("### Compact design-system handling");
      lines.push(
        "- Use the design-system paths above as source of truth. Read SKILL.md, tokens, or README only when exact brand rules or token names are needed for this request.",
      );
      lines.push(
        "- Prefer targeted Grep/Read ranges over loading full design-system files. Reuse existing CSS variables instead of inventing new palettes or type stacks.",
      );
      lines.push("");
    } else if (ds.skill_md_path) {
      const content = await readOptional(ds.skill_md_path);
      if (content) {
        lines.push("### SKILL.md");
        lines.push("```markdown");
        lines.push(content.slice(0, MAX_SKILL_CHARS));
        lines.push("```");
        lines.push("");
      }
    }
    if (contextMode === "full" && ds.tokens_css_path) {
      const content = await readOptional(ds.tokens_css_path);
      if (content) {
        lines.push("### colors_and_type.css (excerpt)");
        lines.push("```css");
        lines.push(content.split("\n").slice(0, MAX_TOKENS_CSS_LINES).join("\n"));
        lines.push("```");
        lines.push("");
      }
    }
    if (contextMode === "full" && ds.readme_md_path) {
      const content = await readOptional(ds.readme_md_path);
      if (content) {
        lines.push("### README.md (excerpt)");
        lines.push("```markdown");
        lines.push(content.split("\n").slice(0, MAX_README_LINES).join("\n"));
        lines.push("```");
        lines.push("");
      }
    }
  }

  if (userEvent.attachments && userEvent.attachments.length > 0) {
    lines.push("## Attachments");
    const selected = context.attachments.filter((attachment) =>
      userEvent.attachments?.includes(attachment.file_path),
    );
    for (const attachment of selected) {
      lines.push(
        `- ${attachment.original_name} (${attachment.mime_type}, ${attachment.size_bytes}B)`,
      );
      const summary = await readAttachmentSummary(attachment.file_path);
      if (summary) {
        const extractedTextPath = attachmentExtractedTextPath(attachment.file_path);
        const hasExtractedText = (await readOptional(extractedTextPath)) != null;
        lines.push(
          `  source_path: ${attachment.file_path} (binary attachment; do not Read/Glob/Bash this file directly)`,
        );
        if (hasExtractedText) {
          lines.push(
            `  extracted_text_path: ${extractedTextPath} (safe text version for Read)`,
          );
        }
        for (const summaryLine of renderAttachmentSummary(summary)) {
          lines.push(`  ${summaryLine}`);
        }
      } else {
        lines.push(`  path: ${attachment.file_path}`);
      }
    }
    for (const p of userEvent.attachments) {
      if (!selected.some((attachment) => attachment.file_path === p)) {
        lines.push(`- ${p}`);
      }
    }
    lines.push("");
  }

  if (context.openComments.length > 0) {
    lines.push("## Open comments");
    for (const comment of context.openComments) {
      const body = comment.body.trim() || "(no note)";
      const selector = comment.node_selector || "body";
      const position = `x=${comment.x_pct.toFixed(1)}% y=${comment.y_pct.toFixed(1)}%`;
      const slideScope =
        comment.slide_index == null
          ? "file-wide"
          : `slide=${comment.slide_index + 1} (slide_index=${comment.slide_index})`;
      lines.push(
        `- [${comment.id}] ${comment.rel_path} ${slideScope} @ ${selector} (${position}) -> ${body}`,
      );
    }
    lines.push("");
  }

  if (project.project_type === "slide_deck") {
    lines.push("## Slide deck skill");
    lines.push(
      contextMode === "compact"
        ? COMPACT_DECK_SKILL_MD.trim()
        : DECK_SKILL_MD.trim(),
    );
    lines.push("");
  } else if (project.project_type === "prototype") {
    lines.push("## Prototype skill");
    lines.push(
      contextMode === "compact"
        ? COMPACT_PROTOTYPE_SKILL_MD.trim()
        : PROTOTYPE_SKILL_MD.trim(),
    );
    lines.push("");
  }

  lines.push("## Delivery");
  lines.push(
    `- Write or edit files inside \`${project.project_dir}\`. Do not touch anything outside this directory.`,
  );
  lines.push(
    `- The entrypoint \`${project.entrypoint}\` must be the primary artifact displayed in the canvas.`,
  );
  lines.push(
    "- Keep the design consistent with the design system above. Reference tokens from colors_and_type.css by CSS variable name when styling.",
  );
  lines.push(
    "- For summarized .pptx/.pdf attachments, plan from the inlined summary first and Read the extracted_text_path if you need slide or page wording.",
  );
  lines.push(
    "- Do not use Read, Glob, or Bash against the original binary .pptx/.pdf attachment path unless the harness explicitly gives you a text-safe derivative file.",
  );
  lines.push(
    "- When you are done with the current turn, end your reply with a one-sentence summary of what changed.",
  );
  lines.push("");

  lines.push("## Request");
  lines.push(userEvent.text);

  return lines.join("\n");
}

const COMPACT_DECK_SKILL_MD = `# Slide deck compact contract

## Token budget rules (READ THESE FIRST)
- The "## Deck structure" section above is your map. Use it to plan instead of Reading the full file.
- **Read \`deck.html\` at most ONCE per turn.** Re-reading the same file is forbidden — keep findings in working memory across tool calls.
- When you do need a slide's exact markup, use \`Grep\` for \`data-bg-node-id="slide-N"\` to find the line, then \`Read\` with \`offset\`/\`limit\` covering that slide only — never the whole file.
- Prefer multiple targeted \`Edit\` calls (small \`old_string\`/\`new_string\`) over a \`Write\` of the whole file. \`Write\` re-emits the entire 100 KB+ artifact and is the most expensive thing you can do.
- For multi-slide redesigns, plan all edits before executing, then issue them as a batch. Do not Read between Edits.

## Structure
- Every slide is a top-level \`<section data-slide>\` directly under \`<body>\`. Preserve order unless the user asks for narrative change.
- Preserve \`<script src="/runtime/deck-stage.js" defer></script>\`; do not set \`data-active\` statically or reimplement deck navigation.
- Every visible text element needs a unique \`data-bg-node-id="slide-{N}-{purpose}"\`; parent slides use \`data-bg-node-id="slide-{N}"\`.

## Style
- Use asymmetric layouts, oversized type or KPI numbers where useful, and avoid centered-everything except cover/closing slides.
- Keep CSS inline in the top \`<style>\` block. Reference design-system CSS variables (see list above) and avoid new palettes, font stacks, or typefaces.`;

const COMPACT_PROTOTYPE_SKILL_MD = `# Prototype compact contract

## Token budget rules (READ THESE FIRST)
- The "## Prototype structure" section above is your map. Use it to plan instead of Reading the full file.
- **Read \`index.html\` at most ONCE per turn.** Re-reading the same file is forbidden — keep findings in working memory across tool calls.
- When you need a section's exact markup, use \`Grep\` for \`data-section="..."\` (or \`data-bg-node-id\`) to find the line, then \`Read\` with \`offset\`/\`limit\` covering that section only.
- Prefer multiple targeted \`Edit\` calls over \`Write\`. \`Write\` re-emits the entire artifact and is the most expensive thing you can do.

## Structure & style
- Work in \`index.html\`; keep the artifact self-contained with inline CSS and vanilla JS unless the user explicitly asks otherwise.
- Top-level semantic sections need \`data-section\` and unique \`data-bg-node-id\` values for visible text and editable parent sections.
- Strong visual hierarchy, asymmetric sections outside true heroes, responsive down to 360 px, no hidden primary value.
- Keep CSS in one top \`<style>\` block. Reference design-system CSS variables (see list above) and avoid new palettes, font stacks, or typefaces.`;

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readAttachmentSummary(
  filePath: string,
): Promise<UploadManifest | null> {
  try {
    return await readUploadManifest(attachmentSummaryPath(filePath));
  } catch {
    return null;
  }
}

function renderAttachmentSummary(summary: UploadManifest): string[] {
  const lines = [
    `summary: ${summary.kind.toUpperCase()} | ${summary.page_count} page(s) | brand=${summary.brand_name ?? "unknown"}`,
  ];
  if (summary.fonts.length > 0) {
    lines.push(`fonts: ${summary.fonts.slice(0, 4).join(", ")}`);
  }
  if (summary.colors.length > 0) {
    lines.push(`colors: ${summary.colors.slice(0, 6).join(", ")}`);
  }
  if (summary.headings.length > 0) {
    lines.push(`headings: ${summary.headings.slice(0, 3).join(" | ")}`);
  }
  if (summary.bodies.length > 0) {
    lines.push(`body samples: ${summary.bodies.slice(0, 2).join(" | ")}`);
  }
  if (summary.pages.length > 0) {
    lines.push("page summaries:");
    for (const page of summary.pages.slice(0, MAX_ATTACHMENT_PAGES)) {
      lines.push(
        `- page ${page.index}: ${page.title} -> ${page.summary || page.text_excerpt}`,
      );
    }
  }
  if (summary.notes.length > 0) {
    lines.push(`notes: ${summary.notes.slice(0, 2).join(" | ")}`);
  }
  lines.push("instruction: use this compact summary first for planning.");
  lines.push(
    "instruction: if an extracted_text_path is listed and you need slide/page wording, Read that file instead of the original binary file.",
  );
  lines.push(
    "instruction: do not use Read, Glob, or Bash against the original .pptx/.pdf attachment path.",
  );
  return lines;
}

function parseSlideDeckOptions(optionsJson: string | null): {
  use_speaker_notes: boolean;
} {
  if (!optionsJson) {
    return { use_speaker_notes: false };
  }

  try {
    const parsed = JSON.parse(optionsJson);
    if (parsed && typeof parsed === "object") {
      return {
        use_speaker_notes:
          typeof (parsed as Record<string, unknown>).use_speaker_notes ===
          "boolean"
            ? ((parsed as Record<string, unknown>)
                .use_speaker_notes as boolean)
            : false,
      };
    }
  } catch {
    // Ignore malformed options and fall back to the default deck contract.
  }

  return { use_speaker_notes: false };
}
