/**
 * Per-type skill text injected into the prompt by `prompt-builder.ts`.
 * Prototype projects produce a single `index.html` rendered live in the
 * canvas iframe. This skill teaches the CLI what a polished landing /
 * hero prototype looks like inside our constraints — plain HTML +
 * inline CSS + vanilla JS, no framework, no bundler.
 *
 * Keep this tight — it ships on every turn for a prototype project.
 * Current size ~3.5 KB; re-measure before adding new sections.
 *
 * Design-system boundary: STRUCTURE only — section archetypes, content
 * strictness, node-id contracts, interaction conventions. Colour,
 * typography, and palette choices live in `colors_and_type.css` and
 * must NOT be re-declared here.
 */
export const PROTOTYPE_SKILL_MD = `# Prototype authoring conventions

\`index.html\` renders live in the canvas iframe and feeds edit, comment,
and export modes. Output must be a single self-contained HTML file — no
bundler, no framework, no build step.

## Artifact contract

- One \`index.html\` at the project root with all CSS inline in a top
  \`<style>\` block and JS inline in a \`<script>\` before \`</body>\`.
- No React, Vue, Svelte, Tailwind classes, or bundler-only syntax (no
  JSX, no \`import\` of npm modules). Plain HTML / CSS / vanilla JS only.
- External CDN \`<script>\` tags allowed only on explicit user request.

## Default page structure

- Unspecified pages default to: navbar → hero → features → social proof
  → pricing or secondary feature → CTA banner → footer (4–7 sections).
- Top-level blocks are \`<section data-section="<archetype>">\` direct
  children of \`<body>\`, except navbar (\`<header>\`) and footer
  (\`<footer>\`). Wrap the body sections in a single \`<main>\`.

## Per-section content rules (strict)

- Hero headline ≤ 10 words; subheadline ≤ 20 words; one primary CTA.
- Feature grids: 3–6 cards; title ≤ 5 words, body ≤ 25 words per card.
- Testimonials: quote ≤ 30 words + attribution (name, role, company).
- Pricing: 2–4 tiers; ≤ 6 feature bullets per tier, ≤ 10 words each.
- CTA banner: one sentence + verb-first button ≤ 4 words.
- Break dense blocks into list items or multiple cards. No walls of text.

## Section archetypes (pick one per section via \`data-section\`)

- \`hero-centered\` — large centered headline + subheadline + single CTA.
- \`hero-split\` — copy left, product shot or illustration right.
- \`hero-video\` — full-bleed loop + dark overlay + centered copy.
- \`feature-grid-3\` — 3-column responsive cards (icon + title + body).
- \`feature-alternating\` — image/text rows flipping L↔R every row.
- \`logo-strip\` — horizontal monochrome row of customer logos.
- \`quote-hero\` — oversized pull quote + attribution, calm background.
- \`testimonial-grid\` — 2–3 column testimonial cards.
- \`pricing-tiered\` — side-by-side tier cards, "popular" tier highlighted.
- \`stats-row\` — 3–4 oversized numbers + labels, thin dividers.
- \`faq-accordion\` — disclosure pattern using \`<details><summary>\`.
- \`cta-banner\` — narrow band, one sentence + button, edge-to-edge.
- \`footer-minimal\` — three-column logo / link groups / legal.

## Visual hierarchy

- Prefer asymmetric layouts; avoid centered-everything outside heroes.
- Whitespace is a feature; let oversized type and numbers breathe.
- Progressive disclosure: \`<details>\` for FAQs, hover reveals for
  secondary detail. Never hide primary value behind a scroll.

## Interaction conventions

- CSS transitions and \`@keyframes\` for entrance/hover effects.
- Scroll-triggered reveals: a single \`IntersectionObserver\` toggling a
  \`[data-revealed]\` attribute; transition defined in CSS.
- \`scroll-behavior: smooth\` on \`<html>\` and anchor links for in-page nav.
- No external JS libraries (Framer Motion, GSAP, hls.js, AOS, etc.) without
  an explicit user request. Keep total JS under ~100 lines.

## Node IDs (required for edit / comment modes)

- Every visible text element carries
  \`data-bg-node-id="<section>-<purpose>"\` — e.g. \`hero-headline\`,
  \`hero-cta\`, \`feature-2-title\`, \`footer-copyright\`. No duplicates.
- Parent sections get \`data-bg-node-id="<section>"\` (\`hero\`, \`features\`,
  \`pricing\`).

## Styling

- All CSS inline in one top \`<style>\` block.
- Reference \`colors_and_type.css\` tokens by CSS variable name. Do not
  hardcode colours, font families, or scales that exist as tokens.
- Do not introduce new palettes, font stacks, or typefaces. The design
  system owns visual identity; archetypes describe STRUCTURE only.
- Mobile first. \`@media (min-width: 640px)\` for tablet,
  \`(min-width: 1024px)\` for desktop. Must not break below 360 px.

## Video & media (allowed, with guards)

- \`<video>\` and \`<iframe>\` are allowed when the user asks. Prefer
  \`<video autoplay muted playsinline loop>\` for background loops.
- Always provide a \`poster\` and an inline \`<style>\` fallback background
  so the section renders before media loads.
- Warn the user when a URL is external: it may fail to load in the
  canvas iframe or during screenshot capture.

## Don'ts

- No React, Vue, Svelte, Next.js, Vite, or any bundler-only syntax.
- No \`npm install\` or external package references in the output.
- No files outside the project directory.
- Do not override design-system tokens for colour or typography.
- Do not embed user secrets or API keys in the HTML.
`;
