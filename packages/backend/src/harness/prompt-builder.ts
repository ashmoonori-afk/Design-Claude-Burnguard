import { readFile } from "node:fs/promises";
import type { UserEvent } from "@bg/shared";
import type { buildSessionContext } from "../services/context";
import { DECK_SKILL_MD } from "./skills/deck-skill";

type SessionContext = NonNullable<Awaited<ReturnType<typeof buildSessionContext>>>;

const MAX_FILES_LISTED = 60;
const MAX_SKILL_CHARS = 4000;
const MAX_TOKENS_CSS_LINES = 150;
const MAX_README_LINES = 120;

/**
 * Builds the prompt text piped into the LLM CLI's stdin.
 * Mirrors doc/03-backend-adapters.md section 5.4 at a Phase 1 minimum: project state,
 * design system (SKILL.md + tokens CSS + README), attachments, user request.
 */
export async function buildPrompt(
  context: SessionContext,
  userEvent: Extract<UserEvent, { type: "user.message" }>,
): Promise<string> {
  const lines: string[] = [];
  const project = context.project;

  lines.push("# BurnGuard Design project session");
  lines.push("");
  lines.push(
    "You are working inside a local project directory. Every file you Write or Edit will be rendered live in a canvas iframe in the BurnGuard Design app. Use the pre-installed toolset (Read/Write/Edit/Glob/Grep/Bash) to create the artifact.",
  );
  lines.push("");

  // Project section
  lines.push("## Project");
  lines.push(`- id: ${project.project_id}`);
  lines.push(`- name: ${project.project_name}`);
  lines.push(`- type: ${project.project_type}`);
  lines.push(`- entrypoint: ${project.entrypoint}`);
  lines.push(`- directory: ${project.project_dir}`);
  if (project.project_type === "slide_deck") {
    const slideDeckOptions = parseSlideDeckOptions(project.options_json);
    lines.push(`- use_speaker_notes: ${slideDeckOptions.use_speaker_notes ? "true" : "false"}`);
  }
  lines.push("");

  // File list
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

  // Design system: SKILL.md + tokens CSS inlined so the first turn doesn't
  // need a Read round-trip before it can produce branded output.
  if (context.designSystem) {
    const ds = context.designSystem;
    lines.push("## Design system");
    lines.push(`- name: ${ds.name}`);
    lines.push(`- directory: ${ds.dir_path}`);
    if (ds.skill_md_path) lines.push(`- skill: ${ds.skill_md_path}`);
    if (ds.tokens_css_path) lines.push(`- tokens: ${ds.tokens_css_path}`);
    if (ds.readme_md_path) lines.push(`- readme: ${ds.readme_md_path}`);
    lines.push("");

    if (ds.skill_md_path) {
      const content = await readOptional(ds.skill_md_path);
      if (content) {
        lines.push("### SKILL.md");
        lines.push("```markdown");
        lines.push(content.slice(0, MAX_SKILL_CHARS));
        lines.push("```");
        lines.push("");
      }
    }
    if (ds.tokens_css_path) {
      const content = await readOptional(ds.tokens_css_path);
      if (content) {
        lines.push("### colors_and_type.css (excerpt)");
        lines.push("```css");
        lines.push(
          content.split("\n").slice(0, MAX_TOKENS_CSS_LINES).join("\n"),
        );
        lines.push("```");
        lines.push("");
      }
    }
    if (ds.readme_md_path) {
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

  // Attachments
  if (userEvent.attachments && userEvent.attachments.length > 0) {
    lines.push("## Attachments");
    for (const p of userEvent.attachments) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  // Open comments pinned on the canvas by the user. Only unresolved pins
  // are forwarded so the CLI knows which notes still need addressing.
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

  // Project-type-specific authoring skill. Injected AFTER the design system
  // (which defines *look*) and BEFORE Delivery (which defines *scope*), so
  // the skill can reference tokens introduced above and still be governed
  // by the hard rules that come after.
  if (project.project_type === "slide_deck") {
    lines.push("## Slide deck skill");
    lines.push(DECK_SKILL_MD.trim());
    lines.push("");
  }

  // Delivery guidance
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
    "- When you are done with the current turn, end your reply with a one-sentence summary of what changed.",
  );
  lines.push("");

  // The user's request
  lines.push("## Request");
  lines.push(userEvent.text);

  return lines.join("\n");
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
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
          typeof (parsed as Record<string, unknown>).use_speaker_notes === "boolean"
            ? ((parsed as Record<string, unknown>).use_speaker_notes as boolean)
            : false,
      };
    }
  } catch {
    // Ignore malformed options and fall back to the default deck contract.
  }

  return { use_speaker_notes: false };
}
