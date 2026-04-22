import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { projectsTable, sessionsTable } from "./schema";
import { projectsDir } from "../lib/paths";
import { DECK_STAGE_JS } from "../runtime/deck-stage";

const TUTORIAL_TAG = "[burnguard:tutorial]";

export const PROTOTYPE_TUTORIAL_NAME = `${TUTORIAL_TAG} Prototype demo`;
export const DECK_TUTORIAL_NAME = `${TUTORIAL_TAG} Slide deck demo`;

/**
 * Fixed HTML for the prototype tutorial. A single-page artifact that renders
 * end-to-end through the html_zip export and mirrors what a Phase 1 prompt
 * might produce. Kept self-contained — no external fonts or scripts — so
 * the offline export works verbatim.
 */
export const PROTOTYPE_TUTORIAL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Prototype tutorial</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: light; --ink: #111827; --accent: #E06B4C; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #FAFAF7;
      color: var(--ink);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 48px;
    }
    main { max-width: 640px; text-align: center; }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 48px;
      line-height: 1.05;
      letter-spacing: -0.02em;
      margin: 0 0 16px;
    }
    p { font-size: 16px; line-height: 1.6; color: #4B5563; }
    .cta {
      display: inline-block;
      margin-top: 24px;
      padding: 10px 18px;
      background: var(--ink);
      color: white;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow" data-bg-node-id="eyebrow">BurnGuard tutorial</div>
    <h1 data-bg-node-id="headline">Edit this headline in Edit mode.</h1>
    <p data-bg-node-id="body">This prototype artifact ships with every fresh install so you can try comment, edit, and export without waiting on a CLI turn.</p>
    <a class="cta" href="#" data-bg-node-id="cta">Try the canvas</a>
  </main>
</body>
</html>
`;

/**
 * Fixed HTML for the slide-deck tutorial. Three slides matching the
 * `[data-slide]` contract so deck-stage activates it and PDF/PPTX export
 * iterate over real content. Runtime script path is relative on purpose
 * (not `/runtime/deck-stage.js`) so offline staging works without the
 * exporter rewriting it.
 */
export const DECK_TUTORIAL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deck tutorial</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: dark; --ink: #F5F5F7; --accent: #E06B4C; }
    body {
      margin: 0;
      background: #101318;
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body[data-deck-ready] .deck-slide:not([data-active]) {
      display: none;
    }
    body[data-deck-ready] .deck-slide {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 48px;
      text-align: center;
    }
    .deck-slide h1 {
      font-size: 96px;
      line-height: 1;
      letter-spacing: -0.02em;
      margin: 0 0 16px;
    }
    .deck-slide h2 {
      font-size: 56px;
      line-height: 1.05;
      margin: 0 0 12px;
      color: var(--accent);
    }
    .deck-slide p {
      font-size: 20px;
      line-height: 1.6;
      color: rgba(245,245,247,0.75);
      max-width: 720px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <section data-slide class="deck-slide" data-bg-node-id="slide-1">
    <div>
      <div class="eyebrow" data-bg-node-id="slide-1-eyebrow">BurnGuard tutorial</div>
      <h1 data-bg-node-id="slide-1-title">Ship decks faster.</h1>
      <p data-bg-node-id="slide-1-body">Three slides, editable in-place. Try arrow keys to navigate.</p>
    </div>
  </section>
  <section data-slide class="deck-slide" data-bg-node-id="slide-2">
    <div>
      <h2 data-bg-node-id="slide-2-title">What just happened?</h2>
      <p data-bg-node-id="slide-2-body">The runtime script toggles <code>data-active</code> on one slide at a time. PDF and PPTX export override that gate so every slide prints.</p>
    </div>
  </section>
  <section data-slide class="deck-slide" data-bg-node-id="slide-3">
    <div>
      <h2 data-bg-node-id="slide-3-title">Try exporting.</h2>
      <p data-bg-node-id="slide-3-body">Open the Export menu and pick HTML zip, PDF, or PowerPoint. PDF and PPTX need a Chromium install — Settings has a one-click button.</p>
    </div>
  </section>
  <script src="/runtime/deck-stage.js"></script>
</body>
</html>
`;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the two built-in tutorial projects if they aren't already in the
 * DB. Idempotent — matches by the tagged name so a manually-deleted tutorial
 * won't be recreated (the user owns it once they've touched it).
 */
export async function seedTutorialsOnce(): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ name: projectsTable.name })
    .from(projectsTable);
  const names = new Set(existing.map((row) => row.name));

  if (!names.has(PROTOTYPE_TUTORIAL_NAME)) {
    await writeTutorialProject({
      name: PROTOTYPE_TUTORIAL_NAME,
      type: "prototype",
      entrypoint: "index.html",
      html: PROTOTYPE_TUTORIAL_HTML,
    });
  }
  if (!names.has(DECK_TUTORIAL_NAME)) {
    await writeTutorialProject({
      name: DECK_TUTORIAL_NAME,
      type: "slide_deck",
      entrypoint: "deck.html",
      html: DECK_TUTORIAL_HTML,
    });
  }
}

async function writeTutorialProject(input: {
  name: string;
  type: "prototype" | "slide_deck";
  entrypoint: string;
  html: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const projectId = ulid();
  const sessionId = ulid();
  const dirPath = path.join(projectsDir, projectId);

  await mkdir(path.join(dirPath, ".attachments"), { recursive: true });
  await mkdir(path.join(dirPath, ".meta", "checkpoints"), { recursive: true });
  await writeFile(path.join(dirPath, input.entrypoint), input.html, "utf8");

  // Slide decks need deck-stage.js next to the artifact so they can be
  // staged + exported without relying on the HTTP runtime route.
  if (input.type === "slide_deck") {
    const runtimeDir = path.join(dirPath, "runtime");
    if (!(await exists(runtimeDir))) {
      await mkdir(runtimeDir, { recursive: true });
    }
    await writeFile(
      path.join(runtimeDir, "deck-stage.js"),
      DECK_STAGE_JS,
      "utf8",
    );
  }

  await db.insert(projectsTable).values({
    id: projectId,
    name: input.name,
    type: input.type,
    designSystemId: null,
    dirPath,
    entrypoint: input.entrypoint,
    thumbnailPath: null,
    backendId: "claude-code",
    optionsJson: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  await db.insert(sessionsTable).values({
    id: sessionId,
    projectId,
    backendId: "claude-code",
    status: "idle",
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  });
}

export async function findTutorialProjectId(
  kind: "prototype" | "slide_deck",
): Promise<string | null> {
  const db = getDb();
  const name =
    kind === "prototype" ? PROTOTYPE_TUTORIAL_NAME : DECK_TUTORIAL_NAME;
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.name, name))
    .limit(1);
  return rows[0]?.id ?? null;
}
