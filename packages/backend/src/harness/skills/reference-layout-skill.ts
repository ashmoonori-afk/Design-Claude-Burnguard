export const REFERENCE_LAYOUT_SKILL_MD = `# Reference layout contract

Use the versioned \`<burnguard-reference-layout-v1>\` JSON as the sole layout
authority for this turn.

## Materialize before editing

- Create or update \`layout-spec.json\` in the project before changing the
  artifact. Preserve every known value and explicit unknown from the context.
- Use one top-left coordinate system. Store stable element anchors in normalized
  0..1 coordinates and keep their identifiers stable across revisions.
- Treat the selected reference attachment as an immutable underlay. Never edit,
  overwrite, move, rename, or optimize the original attachment.

## Geometry and visual evidence

- Preserve the reference aspect ratio and requested orientation.
- Hard geometry controls page bounds, scale, dimensions, and anchor placement.
  Visual inspiration may guide composition or styling but never overrides hard
  geometry.
- Do not infer missing scale, bleed, safe margins, or dimensions. Keep the
  corresponding \`unknown\` status in \`layout-spec.json\`.

## Export boundary

- Keep custom dimensions in the HTML canvas and layout spec.
- If the context marks PDF or PPTX unsupported, report that limitation and
  preserve the spec. Never silently coerce custom paper to A4.
- Use the provided raster target only when its status is \`known\`.`;
