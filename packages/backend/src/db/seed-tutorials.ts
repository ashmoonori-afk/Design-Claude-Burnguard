import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { projectsTable, sessionsTable } from "./schema";
import { projectsDir } from "../lib/paths";
import { DECK_STAGE_JS } from "../runtime/deck-stage";

export const TUTORIAL_TAG = "[burnguard:tutorial]";

export const PROTOTYPE_TUTORIAL_NAME = `${TUTORIAL_TAG} Prototype demo`;
export const DECK_TUTORIAL_NAME = `${TUTORIAL_TAG} Slide deck demo`;

export const PROMPT_SAMPLE_TAG = "[burnguard:prompt-sample]";

interface PromptSample {
  slug: string;
  name: string;
  layout: "split-saas" | "liquid-orb" | "editorial" | "cinematic";
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
    slug: "clearinvoice-static-saas",
    name: `${PROMPT_SAMPLE_TAG} ClearInvoice static SaaS`,
    layout: "split-saas",
    eyebrow: "Static SaaS hero",
    headline: "Manage your online store while saving 3x operating cost.",
    subhead:
      "A dark billing-product landing page that works as a single HTML file with only inline HTML and CSS.",
    theme: {
      bg: "#050505",
      fg: "#ffffff",
      muted: "rgba(255,255,255,0.72)",
      accent: "#ff5b1f",
      panel: "rgba(255,255,255,0.08)",
    },
    prompt: `Build a self-contained single-file HTML/CSS landing page for a billing SaaS called ClearInvoice.

Use only one index.html file. Put all CSS in one <style> tag and avoid external runtime dependencies.

Visual direction:
- Dark background, premium software dashboard mood.
- Add a thin 5px top gradient bar from #ccf through #e7d04c to #31fb78.
- Navigation: logo on the left, links Features / Pricing / Reviews centered, Sign In and Sign Up on the right.
- Hero layout: left copy, right dashboard-style billing card stack.
- Headline: "Manage your online store while saving 3x operating cost."
- Subhead: "ClearInvoice takes the hassle out of billing with easy-to-use tools."
- Primary CTA: orange gradient #FF3300 to #EE7926 with glow and inner stroke.
- Secondary CTA: white glass button.
- Social proof: three overlapping initials and "Trusted by 210k+ stores worldwide".

Use data-bg-node-id on headline, subhead, both CTAs, dashboard card, and social proof so BurnGuard edit mode can target them.`,
  },
  {
    slug: "taskly-liquid-glass",
    name: `${PROMPT_SAMPLE_TAG} Taskly liquid glass`,
    layout: "liquid-orb",
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
    prompt: `Build a self-contained single-file HTML/CSS landing page for Taskly.

Use only one index.html file. Simulate the "glassy orb" with layered CSS radial gradients and blur.

Core layout:
- White background with layered blue glow in the top-left.
- Max-width 1600px content.
- Responsive two-column desktop layout, single-column mobile layout.

Navbar:
- Sticky centered liquid-glass pill at top 30px.
- Logo "Taskly", links Home / Features / Company / Pricing, and a glassy SignUp button.
- Use backdrop blur, rgba white background, rounded 16px, outer stroke, and inset highlight.

Hero:
- Headline: "Work smarter, achieve faster"
- Subheadline: "Effortlessly manage your projects, collaborate with your team, and achieve your goals with our intuitive task management tool."
- Add a "Rated 4.9/5 by 2700+ customers" badge with five orange stars.
- CTA: "Get Started Now" in translucent electric blue with white circular arrow icon.
- Bottom logo row: "Trusted by Top-tier product companies" plus five grayscale text logos.

Use data-bg-node-id on navbar, headline, CTA, orb, social proof, and logo row.`,
  },
  {
    slug: "mindloop-monochrome",
    name: `${PROMPT_SAMPLE_TAG} Mindloop monochrome`,
    layout: "editorial",
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
    prompt: `Build a self-contained single-file HTML/CSS landing page for Mindloop, a newsletter and content platform.

Use only one index.html file with inline CSS. Use local/system fonts only.

Theme:
- Pure black background (#000) and white foreground.
- No colorful gradients.
- Editorial monochrome, calm, precise, premium.

Layout:
- Magazine-style asymmetric grid.
- Large title "Mindloop" with one italic accent word in a serif fallback.
- Short description explaining a focused newsletter platform.
- Email capture form with black/white contrast.
- Three editorial cards: "Write", "Curate", "Publish".

Liquid glass:
- Use subtle rgba white panels, backdrop blur, inset highlight, and a thin gradient border mask.

Use data-bg-node-id on headline, accent word, description, email form, and all three cards.`,
  },
  {
    slug: "velorah-cinematic",
    name: `${PROMPT_SAMPLE_TAG} Velorah cinematic hero`,
    layout: "cinematic",
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
    prompt: `Build a self-contained single-file HTML/CSS landing page for Velorah.

Use only one index.html file with inline CSS and no external JavaScript.

Fonts:
- Use system sans for body.
- Use Georgia or another local serif fallback for cinematic display typography.

Navigation:
- Glassmorphic nav over the hero.
- Logo "Velorah" with a small superscript mark.
- Links: Home, Studio, About, Journal, Reach Us.
- CTA: "Begin Journey".

Hero:
- Full viewport hero.
- Use a CSS-only atmospheric background instead of video: dark navy base, soft vertical light beam, film grain via repeating gradients.
- H1: "Where dreams rise through the silence."
- Subtext: "We're designing tools for deep thinkers, bold creators, and quiet rebels. Amid the chaos, we build digital spaces for sharp focus and inspired work."
- CTA: "Begin Journey".

Layout:
- Minimalist, cinematic, vertically centered.
- Avoid decorative blobs. Use the background atmosphere for depth.

Use data-bg-node-id on logo, nav CTA, headline, subtext, and hero CTA.`,
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
    .select({
      name: projectsTable.name,
      dirPath: projectsTable.dirPath,
      entrypoint: projectsTable.entrypoint,
    })
    .from(projectsTable);
  const now = Date.now();
  const currentPromptSampleNames = new Set(
    PROMPT_SAMPLES.map((sample) => sample.name),
  );
  const existingByName = new Map(existing.map((row) => [row.name, row]));
  const names = new Set(existing.map((row) => row.name));

  for (const row of existing) {
    if (
      row.name.startsWith(PROMPT_SAMPLE_TAG) &&
      !currentPromptSampleNames.has(row.name)
    ) {
      await db
        .update(projectsTable)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(projectsTable.name, row.name));
    }
  }

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
    const existingSample = existingByName.get(sample.name);
    if (existingSample) {
      await syncPromptSampleProject({
        name: sample.name,
        dirPath: existingSample.dirPath,
        entrypoint: existingSample.entrypoint,
        html: renderPromptSampleHtml(sample),
      });
      continue;
    }
    await writeTutorialProject({
      name: sample.name,
      type: "from_template",
      entrypoint: "index.html",
      html: renderPromptSampleHtml(sample),
    });
  }
}

function renderPromptSampleHtml(sample: PromptSample): string {
  switch (sample.layout) {
    case "split-saas":
      return renderSplitSaasSample(sample);
    case "liquid-orb":
      return renderLiquidOrbSample(sample);
    case "editorial":
      return renderEditorialSample(sample);
    case "cinematic":
      return renderCinematicSample(sample);
  }
}

function renderSplitSaasSample(sample: PromptSample): string {
  return renderPromptSampleDocument({
    sample,
    colorScheme: "dark",
    styles: `
    body {
      margin: 0;
      min-height: 100vh;
      background: #050505;
      color: var(--fg);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0 0 auto;
      height: 5px;
      background: linear-gradient(90deg, #ccf, #e7d04c, #31fb78);
      z-index: 5;
    }
    .page { width: min(1220px, calc(100vw - 40px)); margin: 0 auto; padding: 38px 0; }
    .topbar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; margin-bottom: 68px; }
    .brand { font-weight: 800; letter-spacing: -0.04em; }
    .links { display: flex; gap: 22px; color: var(--muted); font-size: 13px; }
    .auth { justify-self: end; display: flex; gap: 10px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 10px 15px; background: rgba(255,255,255,0.06); color: var(--fg); text-decoration: none; }
    .pill.hot { background: linear-gradient(135deg, #ff3300, #ee7926); box-shadow: 0 18px 42px rgba(255,91,31,0.34); }
    .hero { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 42px; align-items: center; }
    .copy h1 { margin: 16px 0 18px; max-width: 650px; font-size: clamp(50px, 7vw, 92px); line-height: 0.9; letter-spacing: -0.075em; }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
    .subhead { max-width: 520px; color: var(--muted); font-size: 18px; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0; }
    .avatars { display: flex; align-items: center; gap: 14px; color: var(--muted); }
    .avatar-stack { display: flex; }
    .avatar { display: grid; place-items: center; width: 38px; height: 38px; margin-right: -10px; border: 2px solid #050505; border-radius: 50%; background: var(--fg); color: #050505; font-weight: 800; }
    .dashboard { position: relative; min-height: 520px; border: 1px solid var(--line); border-radius: 34px; padding: 24px; background: radial-gradient(circle at 20% 0%, rgba(255,91,31,0.24), transparent 28rem), rgba(255,255,255,0.055); box-shadow: 0 30px 110px rgba(0,0,0,0.55); overflow: hidden; }
    .invoice-card { position: absolute; inset: 52px 36px auto auto; width: min(420px, 76%); border: 1px solid rgba(255,255,255,0.18); border-radius: 28px; padding: 26px; background: rgba(14,14,14,0.78); backdrop-filter: blur(22px); box-shadow: 0 26px 70px rgba(0,0,0,0.38); }
    .row { display: flex; justify-content: space-between; gap: 20px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--muted); }
    .total { margin-top: 20px; font-size: 42px; font-weight: 900; letter-spacing: -0.05em; }
    .float-card { position: absolute; left: 28px; bottom: 46px; width: 260px; border-radius: 24px; padding: 20px; background: #fff; color: #111; box-shadow: 0 28px 70px rgba(0,0,0,0.35); }
    .bar { height: 10px; margin-top: 14px; border-radius: 999px; background: linear-gradient(90deg, #ff3300 72%, #e8e8e8 72%); }
    .info { display: grid; grid-template-columns: 0.62fr 1fr; gap: 18px; margin-top: 36px; }
    ${commonInfoStyles()}
    @media (max-width: 900px) { .topbar, .hero, .info { grid-template-columns: 1fr; } .links { flex-wrap: wrap; } .auth { justify-self: start; } .dashboard { min-height: 430px; } .invoice-card { position: relative; inset: auto; width: 100%; } .float-card { position: relative; left: auto; bottom: auto; margin-top: 18px; } }
    `,
    body: `
    <main class="page">
      <nav class="topbar" data-bg-node-id="sample-navbar">
        <div class="brand">ClearInvoice</div>
        <div class="links"><span>Features</span><span>Pricing</span><span>Reviews</span></div>
        <div class="auth"><a class="pill" href="#">Sign In</a><a class="pill hot" href="#" data-bg-node-id="sample-nav-cta">Sign Up</a></div>
      </nav>
      <section class="hero">
        <div class="copy">
          <div class="eyebrow" data-bg-node-id="sample-eyebrow">${escapeHtml(sample.eyebrow)}</div>
          <h1 data-bg-node-id="sample-headline">${escapeHtml(sample.headline)}</h1>
          <p class="subhead" data-bg-node-id="sample-subhead">${escapeHtml(sample.subhead)}</p>
          <div class="actions"><a class="pill hot" href="#" data-bg-node-id="sample-primary-cta">Start billing</a><a class="pill" href="#prompt" data-bg-node-id="sample-secondary-cta">View prompt</a></div>
          <div class="avatars" data-bg-node-id="sample-social-proof"><span class="avatar-stack"><span class="avatar">A</span><span class="avatar">J</span><span class="avatar">M</span></span><span>Trusted by 210k+ stores worldwide</span></div>
        </div>
        <div class="dashboard" data-bg-node-id="sample-dashboard-card">
          <div class="invoice-card"><div class="row"><span>Invoice volume</span><strong>$84,219</strong></div><div class="row"><span>Automation saved</span><strong>312 hrs</strong></div><div class="row"><span>Failed payments</span><strong>1.8%</strong></div><div class="total">3x lower ops cost</div></div>
          <div class="float-card"><strong>Realtime reconciliation</strong><p>Payments, invoices, and disputes stay aligned without extra headcount.</p><div class="bar"></div></div>
        </div>
      </section>
      <section class="info">${renderUsageCard()}${renderPromptCard(sample)}</section>
    </main>
    `,
  });
}

function renderLiquidOrbSample(sample: PromptSample): string {
  return renderPromptSampleDocument({
    sample,
    colorScheme: "light",
    styles: `
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 12% 0%, rgba(96,177,255,0.36), transparent 34rem), #f8fbff; color: #09111f; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { width: min(1600px, calc(100vw - 40px)); margin: 0 auto; padding: 30px 0 46px; }
    .nav { position: sticky; top: 30px; z-index: 3; width: fit-content; margin: 0 auto 96px; display: flex; align-items: center; gap: 28px; padding: 12px 14px 12px 20px; border: 1px solid rgba(255,255,255,0.72); border-radius: 16px; background: rgba(255,255,255,0.36); backdrop-filter: blur(36px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 70px rgba(0,132,255,0.13); }
    .brand { font-weight: 900; letter-spacing: -0.05em; }
    .links { display: flex; gap: 20px; color: rgba(9,17,31,0.62); font-size: 13px; }
    .signup, .cta { border: 1px solid rgba(0,132,255,0.2); border-radius: 999px; background: rgba(0,132,255,0.78); color: #fff; text-decoration: none; font-weight: 800; }
    .signup { padding: 10px 15px; }
    .hero { display: grid; grid-template-columns: 0.92fr 1.08fr; align-items: center; gap: 20px; min-height: 610px; }
    .badge { width: fit-content; border: 1px solid rgba(9,17,31,0.08); border-radius: 999px; padding: 9px 13px; background: rgba(255,255,255,0.64); box-shadow: 0 12px 40px rgba(0,0,0,0.05); color: rgba(9,17,31,0.72); }
    .stars { color: #ff8a00; letter-spacing: 0.08em; }
    h1 { margin: 24px 0 18px; max-width: 640px; font-size: clamp(56px, 8vw, 118px); line-height: 0.92; letter-spacing: -0.08em; }
    .subhead { max-width: 620px; color: rgba(9,17,31,0.64); font-size: 19px; line-height: 1.7; }
    .cta { display: inline-flex; align-items: center; gap: 13px; margin-top: 30px; padding: 15px 18px 15px 22px; box-shadow: 0 18px 44px rgba(0,132,255,0.25); }
    .arrow { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #fff; color: #0084ff; }
    .orb-wrap { display: grid; place-items: center; min-height: 560px; }
    .orb { width: min(560px, 82vw); aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 34% 25%, #fff 0 8%, rgba(255,255,255,0.1) 18%), radial-gradient(circle at 58% 32%, #74d7ff, transparent 23%), radial-gradient(circle at 42% 64%, #725cff, transparent 28%), radial-gradient(circle at 68% 68%, #00a3ff, transparent 26%), radial-gradient(circle, rgba(255,255,255,0.7), rgba(0,132,255,0.28) 58%, transparent 72%); filter: saturate(1.35) contrast(1.05); box-shadow: 0 50px 130px rgba(0,132,255,0.22), inset -30px -40px 80px rgba(0,43,155,0.22); }
    .logos { margin-top: 34px; padding: 24px 0 0; border-top: 1px solid rgba(9,17,31,0.08); color: rgba(9,17,31,0.48); }
    .logo-row { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 14px; font-weight: 900; filter: grayscale(1); opacity: 0.64; }
    .info { display: grid; grid-template-columns: 1fr 1.4fr; gap: 18px; margin-top: 50px; }
    ${commonInfoStyles("light")}
    @media (max-width: 900px) { .nav, .links { flex-wrap: wrap; } .hero, .info { grid-template-columns: 1fr; } .nav { width: auto; } }
    `,
    body: `
    <main class="page">
      <nav class="nav" data-bg-node-id="sample-navbar"><span class="brand">Taskly</span><span class="links"><span>Home</span><span>Features</span><span>Company</span><span>Pricing</span></span><a class="signup" href="#">SignUp</a></nav>
      <section class="hero">
        <div>
          <div class="badge" data-bg-node-id="sample-social-proof"><span class="stars">*****</span> Rated 4.9/5 by 2700+ customers</div>
          <h1 data-bg-node-id="sample-headline">${escapeHtml(sample.headline)}</h1>
          <p class="subhead" data-bg-node-id="sample-subhead">${escapeHtml(sample.subhead)}</p>
          <a class="cta" href="#" data-bg-node-id="sample-primary-cta">Get Started Now <span class="arrow">-&gt;</span></a>
        </div>
        <div class="orb-wrap"><div class="orb" data-bg-node-id="sample-orb"></div></div>
      </section>
      <section class="logos" data-bg-node-id="sample-logo-row"><span>Trusted by Top-tier product companies</span><div class="logo-row"><span>Northstar</span><span>Arc Labs</span><span>Flux</span><span>Vesta</span><span>Kinfolk</span></div></section>
      <section class="info">${renderUsageCard()}${renderPromptCard(sample)}</section>
    </main>
    `,
  });
}

function renderEditorialSample(sample: PromptSample): string {
  return renderPromptSampleDocument({
    sample,
    colorScheme: "dark",
    styles: `
    body { margin: 0; min-height: 100vh; background: #000; color: #fff; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { width: min(1180px, calc(100vw - 38px)); margin: 0 auto; padding: 54px 0; }
    .masthead { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.62); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 28px; margin-top: 46px; }
    h1 { margin: 0; font-size: clamp(72px, 14vw, 180px); line-height: 0.82; letter-spacing: -0.095em; }
    .accent-word { display: block; margin-top: 10px; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 400; letter-spacing: -0.07em; color: rgba(255,255,255,0.76); }
    .desc { max-width: 580px; margin: 36px 0 0; color: rgba(255,255,255,0.64); font-size: 19px; line-height: 1.75; }
    .signup { display: flex; gap: 10px; max-width: 520px; margin-top: 34px; padding: 8px; border: 1px solid rgba(255,255,255,0.16); border-radius: 999px; background: rgba(255,255,255,0.045); backdrop-filter: blur(18px); }
    .signup span { flex: 1; color: rgba(255,255,255,0.5); padding: 13px 16px; }
    .signup button { border: 0; border-radius: 999px; padding: 0 20px; background: #fff; color: #000; font-weight: 900; }
    .cards { display: grid; gap: 14px; align-self: end; }
    .feature { position: relative; border: 1px solid rgba(255,255,255,0.14); border-radius: 28px; padding: 26px; background: rgba(255,255,255,0.045); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
    .feature::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(135deg, rgba(255,255,255,0.18), transparent 38%); mask: linear-gradient(#000, transparent); }
    .feature strong { display: block; margin-bottom: 12px; font-size: 22px; }
    .feature p { margin: 0; color: rgba(255,255,255,0.58); line-height: 1.65; }
    .info { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 18px; margin-top: 44px; }
    ${commonInfoStyles()}
    @media (max-width: 900px) { .grid, .info { grid-template-columns: 1fr; } .signup { border-radius: 24px; flex-direction: column; } .signup button { min-height: 44px; } }
    `,
    body: `
    <main class="page">
      <header class="masthead"><span>${escapeHtml(sample.eyebrow)}</span><span>Prompt sample / no framework</span></header>
      <section class="grid">
        <div>
          <h1 data-bg-node-id="sample-headline">${escapeHtml(sample.headline)}<span class="accent-word" data-bg-node-id="sample-accent-word">for focused publishing</span></h1>
          <p class="desc" data-bg-node-id="sample-description">${escapeHtml(sample.subhead)}</p>
          <form class="signup" data-bg-node-id="sample-email-form"><span>you@example.com</span><button type="button">Join the loop</button></form>
        </div>
        <div class="cards">
          <article class="feature" data-bg-node-id="sample-card-write"><strong>Write</strong><p>Draft issues in a quiet interface that keeps structure visible and noise out.</p></article>
          <article class="feature" data-bg-node-id="sample-card-curate"><strong>Curate</strong><p>Collect links, notes, and references into one editorial queue.</p></article>
          <article class="feature" data-bg-node-id="sample-card-publish"><strong>Publish</strong><p>Send polished newsletters with a deliberate cadence and clean archive.</p></article>
        </div>
      </section>
      <section class="info">${renderUsageCard()}${renderPromptCard(sample)}</section>
    </main>
    `,
  });
}

function renderCinematicSample(sample: PromptSample): string {
  return renderPromptSampleDocument({
    sample,
    colorScheme: "dark",
    styles: `
    body { margin: 0; min-height: 100vh; color: #fff; background: #002c42; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .hero { position: relative; min-height: 100vh; display: grid; place-items: center; overflow: hidden; padding: 28px; }
    .hero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, rgba(215,233,245,0.28), transparent 34%), linear-gradient(90deg, rgba(0,0,0,0.54), transparent 32%, transparent 68%, rgba(0,0,0,0.44)), linear-gradient(180deg, rgba(0,44,66,0.1), #00131e); }
    .hero::after { content: ""; position: absolute; inset: 0; opacity: 0.16; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 5px); mix-blend-mode: overlay; pointer-events: none; }
    .nav { position: absolute; top: 28px; left: 50%; z-index: 2; transform: translateX(-50%); width: min(1120px, calc(100vw - 42px)); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 14px 18px; border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); }
    .logo { font-family: Georgia, "Times New Roman", serif; font-size: 24px; letter-spacing: -0.04em; }
    .logo sup { font-size: 10px; color: rgba(255,255,255,0.58); }
    .links { display: flex; gap: 22px; color: rgba(255,255,255,0.66); font-size: 13px; }
    .journey { justify-self: end; border: 1px solid rgba(255,255,255,0.24); border-radius: 999px; padding: 10px 16px; color: #fff; background: rgba(255,255,255,0.08); text-decoration: none; }
    .copy { position: relative; z-index: 1; width: min(960px, 100%); text-align: center; padding-top: 74px; }
    h1 { margin: 0 auto; max-width: 950px; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: clamp(62px, 10vw, 150px); line-height: 0.9; letter-spacing: -0.075em; text-wrap: balance; }
    .subtext { max-width: 720px; margin: 28px auto 0; color: rgba(255,255,255,0.72); font-size: 18px; line-height: 1.75; }
    .hero-cta { display: inline-flex; margin-top: 34px; border: 1px solid rgba(255,255,255,0.26); border-radius: 999px; padding: 14px 20px; color: #002c42; background: rgba(255,255,255,0.86); text-decoration: none; font-weight: 900; }
    .info { position: relative; z-index: 1; width: min(1120px, calc(100vw - 42px)); margin: -120px auto 54px; display: grid; grid-template-columns: 0.78fr 1.22fr; gap: 18px; }
    ${commonInfoStyles()}
    @media (max-width: 900px) { .nav { position: relative; top: auto; left: auto; transform: none; grid-template-columns: 1fr; gap: 12px; border-radius: 24px; } .links { flex-wrap: wrap; } .journey { justify-self: start; } .info { grid-template-columns: 1fr; margin-top: -40px; } }
    `,
    body: `
    <main class="hero">
      <nav class="nav" data-bg-node-id="sample-navbar"><span class="logo" data-bg-node-id="sample-logo">Velorah<sup>01</sup></span><span class="links"><span>Home</span><span>Studio</span><span>About</span><span>Journal</span><span>Reach Us</span></span><a class="journey" href="#" data-bg-node-id="sample-nav-cta">Begin Journey</a></nav>
      <section class="copy"><h1 data-bg-node-id="sample-headline">${escapeHtml(sample.headline)}</h1><p class="subtext" data-bg-node-id="sample-subtext">${escapeHtml(sample.subhead)}</p><a class="hero-cta" href="#" data-bg-node-id="sample-hero-cta">Begin Journey</a></section>
    </main>
    <section class="info">${renderUsageCard()}${renderPromptCard(sample)}</section>
    `,
  });
}

function renderPromptSampleDocument(input: {
  sample: PromptSample;
  colorScheme: "dark" | "light";
  styles: string;
  body: string;
}): string {
  const { sample, colorScheme, styles, body } = input;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(promptSampleTitle(sample))}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: ${colorScheme};
      --bg: ${sample.theme.bg};
      --fg: ${sample.theme.fg};
      --muted: ${sample.theme.muted};
      --accent: ${sample.theme.accent};
      --panel: ${sample.theme.panel};
      --line: color-mix(in srgb, var(--fg) 16%, transparent);
    }
    * { box-sizing: border-box; }
    ${styles}
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

function commonInfoStyles(mode: "dark" | "light" = "dark"): string {
  const light = mode === "light";
  return `
    .card { border: 1px solid ${light ? "rgba(9,17,31,0.1)" : "rgba(255,255,255,0.14)"}; border-radius: 24px; padding: 22px; background: ${light ? "rgba(255,255,255,0.74)" : "rgba(255,255,255,0.065)"}; box-shadow: inset 0 1px 0 ${light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)"}; }
    .card h2 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; }
    .card p, .card li { color: ${light ? "rgba(9,17,31,0.64)" : "rgba(255,255,255,0.64)"}; font-size: 13px; line-height: 1.65; }
    .card ol { margin: 0; padding-left: 20px; }
    pre { max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; color: ${light ? "#253041" : "rgba(255,255,255,0.82)"}; font: 12px/1.55 "SFMono-Regular", Consolas, monospace; }
  `;
}

function renderUsageCard(): string {
  return `<section class="card" data-bg-node-id="sample-usage"><h2>How to use</h2><ol><li>Open this project from the Examples tab.</li><li>Review the visual direction on this page.</li><li>Copy the prompt and paste it into the chat panel.</li><li>Ask for a smaller hero-only pass first if you want faster iteration.</li></ol></section>`;
}

function renderPromptCard(sample: PromptSample): string {
  return `<section class="card" id="prompt" data-bg-node-id="sample-prompt"><h2>Source prompt</h2><pre>${escapeHtml(sample.prompt)}</pre></section>`;
}

function promptSampleTitle(sample: PromptSample): string {
  return sample.name.replace(`${PROMPT_SAMPLE_TAG} `, "");
}

async function syncPromptSampleProject(input: {
  name: string;
  dirPath: string;
  entrypoint: string;
  html: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await mkdir(input.dirPath, { recursive: true });
  await writeFile(path.join(input.dirPath, input.entrypoint), input.html, "utf8");
  await db
    .update(projectsTable)
    .set({
      type: "from_template",
      entrypoint: input.entrypoint,
      updatedAt: now,
      archivedAt: null,
    })
    .where(eq(projectsTable.name, input.name));
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
