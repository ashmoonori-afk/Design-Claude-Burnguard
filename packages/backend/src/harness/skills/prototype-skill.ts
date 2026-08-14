/**
 * Per-type skill text injected into the prompt by `prompt-builder.ts`.
 * Prototype projects produce a single `index.html` rendered live in the
 * canvas iframe. This skill teaches the CLI what a polished landing /
 * hero prototype looks like inside our constraints — plain HTML +
 * inline CSS + vanilla JS, no framework, no bundler.
 *
 * Keep this under MAX_SKILL_CHARS (4000); it ships on every prototype turn.
 *
 * Design-system boundary: STRUCTURE only — section archetypes, content
 * strictness, node-id contracts, interaction conventions. Colour,
 * typography, and palette choices live in `colors_and_type.css` and
 * must NOT be re-declared here.
 */
export const PROTOTYPE_SKILL_MD = `# Prototype authoring conventions

\`index.html\` renders live for edit/comment/export. Emit one self-contained file; no framework, bundler, or build.

## Artifact contract

- Root \`index.html\`; all CSS in a top \`<style>\`, all JS in \`<script>\` before \`</body>\`.
- Plain HTML/CSS/JS only: no React/Vue/Svelte/Tailwind, JSX, or npm \`import\`.
- CDN scripts require an explicit request.

## Default page structure

- Default 4–7 sections: navbar → hero → features → social proof → pricing or secondary feature → CTA → footer.
- One \`<main>\` holds direct \`<section data-section="<archetype>">\` children; navbar is \`<header>\`, footer \`<footer>\`.

## Per-section content rules (strict)

- Hero: headline ≤10 words; subheadline ≤20; one primary CTA.
- Features: 3–6 cards; titles ≤5 words, bodies ≤25 each.
- Testimonial: quote ≤30 words + name, role, company.
- Pricing: 2–4 tiers; ≤6 bullets each, ≤10 words per bullet.
- CTA: one sentence + verb-first button ≤4 words.
- Split dense copy into lists/cards; no walls of text.

## Section archetypes (one \`data-section\` each)

- \`hero-centered\` — large centered headline, subheadline, one CTA.
- \`hero-split\` — copy left; product image/illustration right.
- \`hero-video\` — full-bleed loop, dark overlay, centered copy.
- \`feature-grid-3\` — responsive 3-column icon/title/body cards.
- \`feature-alternating\` — image/text rows alternating sides.
- \`logo-strip\` — horizontal monochrome customer logos.
- \`quote-hero\` — oversized quote, attribution, calm background.
- \`testimonial-grid\` — testimonial cards, 2–3 columns.
- \`pricing-tiered\` — adjacent tiers; highlight "popular".
- \`stats-row\` — 3–4 large numbers/labels, thin dividers.
- \`faq-accordion\` — \`<details><summary>\` disclosure.
- \`cta-banner\` — edge-to-edge narrow band, sentence, button.
- \`footer-minimal\` — three columns: logo, links, legal.

## Visual hierarchy

- Prefer asymmetry outside heroes. Reveal detail gradually; keep primary value above the scroll.

## Spatial layout vocabulary

- \`scroll-owner\`: exactly one element owns each scroll axis; the page owns vertical by default.
- Put \`overflow-x\`/\`overflow-y\` on that owner; ancestors must not share that axis.
- Nested scroll needs explicit interaction intent and bounds, never just clipping.
- \`wrap-first\`: try \`flex-wrap\` or Grid \`repeat(auto-fit, minmax(...))\` before breakpoints.
- Let space and item minimums drive reflow.
- Add a breakpoint only when reflow changes structure, not for ordinary wrapping.
- \`load-bearing\`: name the CSS property enforcing each layout decision.
- Mark nearby \`/* load-bearing: decision — property */\`, e.g. \`grid-template-columns\`, \`flex-wrap\`, or \`overflow-*\`.
- Preserve it during edits or replace its enforcement deliberately.

## Interaction conventions

- Use CSS for entrance/hover effects and smooth anchor scrolling.
- One \`IntersectionObserver\` toggles \`[data-revealed]\` for reveals.
- External JS requires explicit request; keep JS under ~100 lines.

## Node IDs (required for edit / comment modes)

- Every visible text has unique \`data-bg-node-id="<section>-<purpose>"\`, e.g. \`hero-headline\`, \`hero-cta\`, \`feature-2-title\`, \`footer-copyright\`.
- Parent sections use \`data-bg-node-id="<section>"\`, e.g. \`hero\`, \`features\`, \`pricing\`.

## Styling

- Keep all CSS in one top \`<style>\`.
- Use \`colors_and_type.css\` variables; never hardcode tokenized colours, font families, or scales.
- Add no palette/font stack/typeface. Design system owns identity; archetypes own STRUCTURE.
- Icons (LUCIDE_ICON_REFERENCE): Read \`packages/backend/src/harness/assets/lucide/reference.md\` on demand; use only its inline \`<svg>\`, retain \`stroke="currentColor"\`, size via \`--icon-size\`; no URL, sprite, or icon font.
- Mobile first: tablet \`@media (min-width: 640px)\`, desktop \`(min-width: 1024px)\`; work below 360px.

## Video & media

- Requested \`<video>\`/\`<iframe>\` needs poster/inline fallback; warn external URLs may fail in canvas/capture.
- Never embed secrets or API keys.
`;
