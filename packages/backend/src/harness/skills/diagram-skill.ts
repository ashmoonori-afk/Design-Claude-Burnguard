/**
 * Request-selected skill text injected by `prompt-builder.ts` when the user asks
 * for a diagram. Diagrams remain self-contained HTML artifacts; this skill adds
 * routing and SVG structure rules without introducing another project type.
 *
 * Keep this under the exported MAX_SKILL_CHARS budget. Design-system tokens
 * continue to own colour and typography; this file defines structure and
 * legibility only.
 */
export const DIAGRAM_SKILL_MD = `# Diagram authoring conventions

Diagrams render inside the artifact's sandboxed srcDoc iframe. Build a clear
explanation, not decoration, and keep every dependency inside the artifact.

## DIAGRAM_TYPE_ROUTER

Before drawing, choose one type and state the choice plus reason in one line:
- \`flowchart\` — decisions, branches, or a process with alternate paths.
- \`sequence\` — ordered messages between actors or systems over time.
- \`architecture\` — components, boundaries, dependencies, and data movement.
- \`timeline\` — milestones or events positioned in chronological order.
- \`comparison\` — options evaluated against the same criteria.
- \`hierarchy\` — parent-child ownership, taxonomy, or reporting structure.

If several fit, pick the type that answers the user's main question with the
fewest marks. Do not combine types unless separate, titled panels are clearer.

## DIAGRAM_COMPLEXITY_BUDGET

- One diagram is capped at 12 nodes, 16 edges, and 4 lanes.
- Count repeated actors, milestones, and decision points as nodes; count each
  connector once. When any cap would be exceeded, split into an overview and
  one or more titled detail diagrams before drawing.
- Prefer deleting secondary detail to shrinking labels. Keep labels readable at
  the artifact's default canvas size and preserve whitespace around groups.

## SVG contract

- Draw diagrams as inline \`<svg>\` only. No external images, fonts (including
  Google Fonts), sprites, scripts, stylesheets, SVG \`use\` references, or
  URL-backed assets: external references do not resolve reliably in the
  sandboxed srcDoc iframe.
- Give the SVG \`role="img"\` and an accessible name via inline \`<title>\` and
  \`<desc>\`. Use a responsive \`viewBox\`; do not rely on canvas or Mermaid.
- Every visible node and label needs a unique \`data-bg-node-id\` so edit and
  comment modes can target it.
- Reference existing design-system tokens by CSS variable name with \`var(--...)\`.
  Do not hardcode colours, font families, or introduce a diagram palette.

## Anti-patterns

- No decorative 3D, fake perspective, gradients that imply depth, or ornamental
  connectors. Visual weight must communicate meaning.
- No unanchored arrows. Every connector starts and ends at a visible node.
- Label every edge with the relationship, action, or message it represents.
- Never encode meaning by colour alone; pair colour with text, shape, line style,
  or an inline symbol, and provide sufficient contrast.
- Prevent crossings before polishing. Reorder nodes or split the diagram rather
  than routing a web of ambiguous lines.
`;
