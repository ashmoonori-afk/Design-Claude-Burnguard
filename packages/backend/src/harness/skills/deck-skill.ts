/**
 * Per-type skill text injected into the prompt by `prompt-builder.ts`.
 * Slide-deck projects need extra conventions beyond a generic HTML prototype
 * so the CLI produces something the deck runtime, exporters, and edit/comment
 * modes can all consume.
 *
 * Keep this tight. Everything here is sent on every turn for a slide_deck
 * project, so every extra paragraph adds to the cached-input token cost.
 * ~1.5 KB is the budget.
 */
export const DECK_SKILL_MD = `# Slide deck authoring conventions

This project is a slide deck. The artifact at \`deck.html\` powers three
consumers simultaneously: an in-app canvas runtime, a PDF exporter, and a
PPTX exporter. Follow these rules exactly — deviations break the runtime or
strip content from exports.

## Structure

- Each slide is a top-level \`<section data-slide>\` element directly inside
  \`<body>\`. Do not nest slides inside wrapper divs.
- Use classes like \`deck-slide\`, \`deck-cover\`, \`deck-closing\` consistently
  with the initial template so shared CSS still applies.
- For a pitch deck, use a 15-slide structure unless the user asks otherwise:
  1. Cover (title, subtitle)
  2. Problem
  3. Why now
  4. Solution (one sentence + hero visual)
  5. Product overview
  6. How it works (3 steps)
  7. Market sizing (TAM / SAM / SOM)
  8. Business model
  9. Traction / metrics
  10. Competition / moat
  11. Go-to-market
  12. Team
  13. Financials or roadmap
  14. The ask
  15. Closing / contact
- Keep slide titles under ~60 characters. Body copy per slide under ~40 words.

## Runtime contract

- Keep \`<script src="/runtime/deck-stage.js" defer></script>\` right before
  \`</body>\`. The runtime handles navigation, keyboard nav, and the hover
  nav bar. Never re-implement that.
- Do not write your own keyboard/hash/pagination JS. The runtime owns it.
- \`data-active\` is managed by the runtime — never set it in the static HTML.
- Respect \`body[data-deck-ready]\` CSS in the template: before the runtime
  loads, slides stack; after, only the active one renders.

## Node IDs for edit / comment modes

- Every user-visible text element (titles, eyebrows, body copy, list items,
  captions) must carry a stable \`data-bg-node-id\` attribute.
- ID format: \`slide-{N}-{purpose}\` — e.g. \`slide-3-title\`,
  \`slide-3-bullet-2\`. Do not reuse IDs across slides.
- Parent sections should have \`data-bg-node-id="slide-{N}"\`.
- IDs let the Edit and Comment modes target the right element across edits.

## Styling

- All CSS is inline in the \`<style>\` block at the top of \`deck.html\`.
- Reference tokens from the design system's \`colors_and_type.css\` by CSS
  variable name. Do not hardcode hex colors that already exist as tokens.
- Standard aspect ratio is 16:9. Keep the \`.deck-slide { aspect-ratio: 16 / 9 }\`
  rule and similar layout defaults intact unless the user asks for a change.

## Speaker notes (optional)

- If the project was created with \`use_speaker_notes\`, include a child
  \`<aside class="deck-notes" data-speaker-notes>...</aside>\` inside every
  slide. The runtime shows them only in presenter mode (\`?present\`).

## What NOT to do

- Do not load external font files or JS libraries without an explicit user
  request — all dependencies add surface for export failures.
- Do not write \`<iframe>\`, \`<video>\`, or \`<audio>\` tags — the PDF exporter
  won't capture them.
- Do not touch files outside the project directory, ever.
`;
