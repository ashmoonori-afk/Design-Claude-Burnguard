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

const PROMPT_SAMPLE_TAG = "[burnguard:prompt-sample]";

interface PromptSample {
  slug: string;
  name: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  theme: {
    bg: string;
    fg: string;
    muted: string;
    accent: string;
    panel: string;
  };
  prompt: string;
}

const PROMPT_SAMPLES: PromptSample[] = [
  {
    slug: "clearinvoice-dark-hero",
    name: `${PROMPT_SAMPLE_TAG} ClearInvoice dark hero`,
    eyebrow: "SaaS video hero",
    headline: "Manage your online store while saving 3x operating cost",
    subhead:
      "A dark-mode SaaS hero with HLS background video, staggered motion, glassy orange CTA, and social proof.",
    theme: {
      bg: "#050505",
      fg: "#ffffff",
      muted: "rgba(255,255,255,0.72)",
      accent: "#ff5b1f",
      panel: "rgba(255,255,255,0.08)",
    },
    prompt: `Create a high-fidelity, dark-mode Hero section for a SaaS product called "ClearInvoice" using React and Tailwind CSS.

Tech Stack:
Framework: React (Vite)
Styling: Tailwind CSS
Animation: motion/react (Framer Motion)
Icons: lucide-react
Video: Native HTML5 <video> with hls.js for streaming (Do NOT use react-player).

Background Video:
Source: https://stream.mux.com/hUT6X11m1Vkw1QMxPOLgI761x2cfpi9bHFbi5cNg4014.m3u8
Behavior: Autoplay, Loop, Muted, PlaysInline. Opacity 100%. No dark overlay.

Hero Content:
Headline: "Manage your online store while save 3x operating cost"
Subhead: "ClearInvoice takes the hassle out of billing with easy-to-use tools."

Button Styles:
Primary gradient from #FF3300 to #EE7926 with glow, inner stroke, hover scale, and sliding Arrow icon.
Secondary button is white/90 with backdrop blur, inner stroke, and hover scale.

Social Proof:
Row of 3 overlapping user avatars and "Trusted by 210k+ stores worldwide".`,
  },
  {
    slug: "sentinel-ai-spline",
    name: `${PROMPT_SAMPLE_TAG} SENTINEL AI hero`,
    eyebrow: "Security company 3D hero",
    headline: "SENTINEL AI",
    subhead:
      "A full-screen dark security landing page with a Spline 3D background, vivid green accent, and bottom-left cinematic copy.",
    theme: {
      bg: "#151515",
      fg: "#f5f5f5",
      muted: "rgba(245,245,245,0.62)",
      accent: "#03ea00",
      panel: "rgba(255,255,255,0.06)",
    },
    prompt: `Create a full-screen dark hero landing page for a security company called "SENTINEL AI" using React, Vite, TypeScript, Tailwind CSS, shadcn/ui, and an embedded Spline 3D scene as the background.

Font:
Google Fonts "Sora" with weights 300, 400, 500, 600, 700.

Color Theme:
Dark charcoal background, near-white foreground, vivid green primary/accent, and dark-only HSL CSS custom properties.

Navbar:
Fixed transparent nav with logo "SENTINEL", links Services / About Us / Projects / Team / Contacts, and a "Get Quote" button.

Hero:
Full-screen section with Spline scene https://prod.spline.design/Slk6b8kz3LRlKiyk/scene.splinecode.
Content anchored bottom-left.
Heading: "SENTINEL" plus green "AI".
Subheading: "We implement security correctly."
Description: "Enterprise security systems built in days. AI-powered surveillance deployed with zero-trust architecture. Smart access control set up for your entire facility. All of it done right, not just fast."
CTA buttons: "Book a Call" and "Our Work".`,
  },
  {
    slug: "taskly-liquid-glass",
    name: `${PROMPT_SAMPLE_TAG} Taskly liquid glass`,
    eyebrow: "White liquid-glass hero",
    headline: "Work smarter, achieve faster",
    subhead:
      "A premium white landing page with a strong liquid-glass navbar, electric blue orb video, social proof, and logo cloud.",
    theme: {
      bg: "#f8fbff",
      fg: "#09111f",
      muted: "rgba(9,17,31,0.64)",
      accent: "#0084ff",
      panel: "rgba(255,255,255,0.72)",
    },
    prompt: `System Prompt: High-Fidelity "Liquid Glass" Hero Section

Core Layout:
Create a 1600px max-width landing page hero section. The background should be pure white with a subtle layered gradient glow in the top-left using blurred ellipses in light blue #60B1FF and #319AFF.

Typography:
Headlines and Brand: Fustat Bold.
Body and UI: Inter.
Hero Headline: "Work smarter, achieve faster" at 75px, 1.05 line-height, -2px tracking.

Navbar:
Sticky at top 30px, centered, w-fit, backdrop-blur 50px, rgba(255,255,255,0.3), rounded 16px.
Logo "Taskly", links Home / Features / Company / Pricing, and glassy "SignUp" button.

Hero Right:
Glassy orb video from https://future.co/images/homepage/glassy-orb/orb-purple.webm with mix-blend-screen, scale-125, and hue/saturation/brightness/contrast filter.

Hero Left:
Social proof badge, subheadline, and "Get Started Now" CTA with electric blue translucent glass treatment.`,
  },
  {
    slug: "mindloop-monochrome",
    name: `${PROMPT_SAMPLE_TAG} Mindloop monochrome`,
    eyebrow: "Newsletter platform",
    headline: "Mindloop",
    subhead:
      "A pure black monochrome newsletter landing page with liquid glass, serif italic accents, and motion-led storytelling.",
    theme: {
      bg: "#000000",
      fg: "#ffffff",
      muted: "rgba(255,255,255,0.62)",
      accent: "#9aa7a4",
      panel: "rgba(255,255,255,0.045)",
    },
    prompt: `Build a dark monochrome landing page called Mindloop, a newsletter/content platform.

Use React + Vite + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion.
Fonts: Inter for sans text and Instrument Serif for italic accent words.
Theme: pure black (#000) background with white foreground. No colors or gradients beyond monochrome.

Design System:
Use HSL CSS variables for background, foreground, card, primary, secondary, muted, accent, border, input, ring, and hero-subtitle.

Liquid Glass:
Define .liquid-glass and .liquid-glass::before with subtle rgba white background, backdrop blur, inset highlight, and gradient border mask.

Landing Page:
Build a premium content/newsletter hero that explains the platform, uses monochrome glass surfaces, and keeps all CTAs crisp and editorial.`,
  },
  {
    slug: "velorah-cinematic",
    name: `${PROMPT_SAMPLE_TAG} Velorah cinematic hero`,
    eyebrow: "Fullscreen video hero",
    headline: "Where dreams rise through the silence.",
    subhead:
      "A cinematic single-page hero with full-screen looping video, glassmorphic navigation, Instrument Serif typography, and minimal overlays.",
    theme: {
      bg: "#002c42",
      fg: "#ffffff",
      muted: "rgba(255,255,255,0.66)",
      accent: "#d7e9f5",
      panel: "rgba(255,255,255,0.055)",
    },
    prompt: `Create a single-page hero section with a fullscreen looping background video, glassmorphic navigation, and cinematic typography. Use React + Vite + Tailwind CSS + TypeScript with shadcn/ui.

Video Background:
Use a fullscreen video element with autoPlay, loop, muted, playsInline.
Source URL: https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4

Fonts:
Instrument Serif for display and Inter for body.

Navigation:
Logo "Velorah" with a small superscript mark. Links Home, Studio, About, Journal, Reach Us. CTA button "Begin Journey" with liquid-glass styling.

Hero:
H1: "Where dreams rise through the silence."
Subtext: "We're designing tools for deep thinkers, bold creators, and quiet rebels. Amid the chaos, we build digital spaces for sharp focus and inspired work."
CTA: "Begin Journey".

Layout:
No decorative blobs, radial gradients, or overlays. The video provides all visual depth.`,
  },
];

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
  for (const sample of PROMPT_SAMPLES) {
    if (names.has(sample.name)) continue;
    await writeTutorialProject({
      name: sample.name,
      type: "from_template",
      entrypoint: "index.html",
      html: renderPromptSampleHtml(sample),
    });
  }
}

function renderPromptSampleHtml(sample: PromptSample): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(sample.name.replace(`${PROMPT_SAMPLE_TAG} `, ""))}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: dark;
      --bg: ${sample.theme.bg};
      --fg: ${sample.theme.fg};
      --muted: ${sample.theme.muted};
      --accent: ${sample.theme.accent};
      --panel: ${sample.theme.panel};
      --line: color-mix(in srgb, var(--fg) 16%, transparent);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 28rem),
        linear-gradient(135deg, color-mix(in srgb, var(--bg) 94%, #000), var(--bg));
      color: var(--fg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .shell {
      width: min(1180px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 42px 0;
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 56px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .mark {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 14px;
      color: var(--bg);
      background: var(--accent);
      font-weight: 800;
      letter-spacing: -0.08em;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
      gap: 28px;
      align-items: stretch;
    }
    .preview {
      min-height: 660px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid var(--line);
      border-radius: 34px;
      padding: clamp(28px, 5vw, 64px);
      background: linear-gradient(180deg, var(--panel), color-mix(in srgb, var(--panel) 45%, transparent));
      box-shadow: 0 30px 90px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
      overflow: hidden;
      position: relative;
    }
    .preview::before {
      content: "";
      position: absolute;
      width: 360px;
      height: 360px;
      border-radius: 999px;
      right: -120px;
      top: -120px;
      background: color-mix(in srgb, var(--accent) 28%, transparent);
      filter: blur(50px);
      pointer-events: none;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 18px;
      position: relative;
      z-index: 1;
    }
    h1 {
      position: relative;
      z-index: 1;
      max-width: 760px;
      margin: 0;
      font-size: clamp(48px, 8vw, 108px);
      line-height: 0.92;
      letter-spacing: -0.065em;
    }
    .subhead {
      position: relative;
      z-index: 1;
      max-width: 620px;
      color: var(--muted);
      font-size: clamp(16px, 2vw, 22px);
      line-height: 1.55;
      margin: 24px 0 0;
    }
    .actions {
      position: relative;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 34px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 999px;
      border: 1px solid var(--line);
      text-decoration: none;
      font-weight: 700;
      color: var(--fg);
      background: color-mix(in srgb, var(--accent) 72%, transparent);
    }
    .button.secondary {
      color: var(--fg);
      background: color-mix(in srgb, var(--fg) 8%, transparent);
    }
    .meta-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 48px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px;
      background: rgba(255,255,255,0.04);
    }
    .metric strong {
      display: block;
      font-size: 20px;
      margin-bottom: 4px;
    }
    .metric span {
      color: var(--muted);
      font-size: 12px;
    }
    .side {
      display: grid;
      gap: 16px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      background: rgba(255,255,255,0.06);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 16px;
      letter-spacing: 0.02em;
    }
    .card p, .card li {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.65;
    }
    .card ol {
      margin: 0;
      padding-left: 20px;
    }
    pre {
      max-height: 360px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      color: color-mix(in srgb, var(--fg) 86%, var(--accent));
      font: 12px/1.55 "SFMono-Regular", Consolas, monospace;
    }
    code {
      color: var(--fg);
      font-family: "SFMono-Regular", Consolas, monospace;
    }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; }
      .preview { min-height: 540px; }
      .meta-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <nav class="nav">
      <span class="mark">BG</span>
      <span>Prototype prompt sample</span>
      <span>${escapeHtml(sample.slug)}</span>
    </nav>
    <main class="hero">
      <section class="preview" data-bg-node-id="sample-preview">
        <div>
          <div class="eyebrow" data-bg-node-id="sample-eyebrow">${escapeHtml(sample.eyebrow)}</div>
          <h1 data-bg-node-id="sample-headline">${escapeHtml(sample.headline)}</h1>
          <p class="subhead" data-bg-node-id="sample-subhead">${escapeHtml(sample.subhead)}</p>
          <div class="actions">
            <a class="button" href="#" data-bg-node-id="sample-primary-cta">Use this prompt</a>
            <a class="button secondary" href="#prompt" data-bg-node-id="sample-secondary-cta">Read prompt</a>
          </div>
        </div>
        <div class="meta-grid">
          <div class="metric"><strong>1</strong><span>Open this example project</span></div>
          <div class="metric"><strong>2</strong><span>Copy the prompt on the right</span></div>
          <div class="metric"><strong>3</strong><span>Paste it into chat to regenerate</span></div>
        </div>
      </section>
      <aside class="side">
        <section class="card" data-bg-node-id="sample-usage">
          <h2>How to use</h2>
          <ol>
            <li>Open this project from the Examples tab.</li>
            <li>Review the target visual direction in the left preview.</li>
            <li>Copy the prompt below and paste it into the chat panel.</li>
            <li>Ask for a smaller variation if you want a hero-only pass first.</li>
          </ol>
        </section>
        <section class="card" id="prompt" data-bg-node-id="sample-prompt">
          <h2>Source prompt</h2>
          <pre>${escapeHtml(sample.prompt)}</pre>
        </section>
      </aside>
    </main>
  </div>
</body>
</html>
`;
}

async function writeTutorialProject(input: {
  name: string;
  type: "prototype" | "slide_deck" | "from_template";
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
