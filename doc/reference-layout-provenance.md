# Reference Layout Provenance

Retrieval date: **2026-08-25**

This document records where BurnGuard's reference-layout ideas came from, what was actually
inspected, how strong the evidence is, and what we are and aren't allowed to reuse. It exists so
that later readers can tell the difference between something we observed in running code and
something we inferred from a README screenshot.

Nothing in here reproduces source, prose, assets, or prompts from the referenced projects. Only
principles and structural observations are carried over.

## Evidence Grades

| Grade | Meaning |
|---|---|
| **E1 - executable source** | Behavior read directly from code paths in the repository at the pinned commit. Claims can be checked line by line. |
| **E2 - README only** | Everything known comes from the repository's README and whatever it embeds. Implementation and accuracy are **unverified**: we never confirmed the described behavior exists in code. |

Within E1 material, three kinds of observation are kept separate:

- **Visual evidence** - screenshots. They show a rendered outcome, not the rule that produced it.
- **Exact observed values** - computed style read back from a live DOM. These are measured numbers,
  the strongest thing on the list.
- **Inference** - patterns in a generated style guide. Useful as a hypothesis, nothing more. A
  generated artifact reflects its generator's assumptions, and we did not audit that generator.

## Repository Records

### 1. graphic-design

- **Repository URL:** https://github.com/491023434/graphic-design
- **Commit SHA (reachable at retrieval):** `a3cf2387e8f5d0f80e5c615fb25f2e1073a0646b`
- **Tree at that commit:** https://github.com/491023434/graphic-design/tree/a3cf2387e8f5d0f80e5c615fb25f2e1073a0646b
- **Paths inspected:**
  [`README.md`](https://github.com/491023434/graphic-design/blob/a3cf2387e8f5d0f80e5c615fb25f2e1073a0646b/README.md)
  only
- **Adopted principle:** treat a poster-style composition as a small number of named regions with a
  dominant focal region, rather than as a free-form canvas.
- **BurnGuard mapping (implemented):** the decomposition idea, that a reference image is broken into
  described parts rather than treated as one opaque picture, shows up as the versioned context
  fields in `packages/shared/src/reference-layout.ts` (`schema_version`, `layout_spec_path`,
  `intent`, `reference`, `canvas`) and as the materialized `layout-spec.json` with stable element
  anchors that `packages/backend/src/harness/skills/reference-layout-skill.ts` instructs the model
  to write. Our decomposition is anchor-based, not region-based: there is no named-region vocabulary
  in the code, and this document doesn't claim one.
- **Evidence grade:** **E2 - README only.** Implementation and accuracy unverified.
- **Limitations:** no code was read; the README's claims about rendering behavior could not be
  confirmed. Any figure or ratio taken from it must be re-derived before use.
- **License / reuse boundary:** **no license file present.** Default copyright applies, so no code,
  text, image, or prompt may be copied. Conceptual influence only.

### 2. poster-design

- **Repository URL:** https://github.com/1955358104/poster-design
- **Commit SHA (reachable at retrieval):** `c29aab04e84951502dbfa26f819b3c8de597f74b`
- **Tree at that commit:** https://github.com/1955358104/poster-design/tree/c29aab04e84951502dbfa26f819b3c8de597f74b
- **Paths inspected:**
  [`README.md`](https://github.com/1955358104/poster-design/blob/c29aab04e84951502dbfa26f819b3c8de597f74b/README.md)
  only
- **Adopted principle:** an editable poster is a tree of typed elements over a fixed artboard, and
  the artboard size is a first-class property rather than a viewport side effect.
- **BurnGuard mapping (implemented):** explicit artboard sizing lives in
  `packages/backend/src/services/reference-layout-values.ts`, which resolves named presets, literal
  width/height with a unit, aspect ratio (tagged `explicit`, `dimensions`, or `preset`), and
  orientation, reorienting dimensions when the two disagree. The matching capability boundary sits
  in `packages/backend/src/services/reference-layout-export.ts`, where each target reports whether a
  custom size survives: `preset_only`, `aspect_presets_only`, or `explicit_pixel_dimensions`. An
  unsupported size is reported and the spec preserved; nothing is silently coerced to A4.
- **Evidence grade:** **E2 - README only.** Implementation and accuracy unverified.
- **Limitations:** the editor internals, coordinate system, and export path were never opened. We
  don't know how the described model behaves under nesting or scaling.
- **License / reuse boundary:** **no license file present.** No copying of any kind. Ideas only.

### 3. ZORY-AI

- **Repository URL:** https://github.com/ZORY-AI/zory-ai
- **Commit SHA (reachable at retrieval):** `33487d9a230614a99332594e1d6f1f231a7b645a`
- **Tree at that commit:** https://github.com/ZORY-AI/zory-ai/tree/33487d9a230614a99332594e1d6f1f231a7b645a
- **Paths inspected:**
  [`README.md`](https://github.com/ZORY-AI/zory-ai/blob/33487d9a230614a99332594e1d6f1f231a7b645a/README.md)
  only
- **Adopted principle:** a sketch or floor-plan style reference carries dimensions that are part of
  the request, not decoration, so the drawing must be held fixed while measurements drive the
  output.
- **BurnGuard mapping (implemented):** `packages/backend/src/services/reference-layout.ts` marks the
  attached reference `role: "immutable_underlay"` and tags its `evidence_boundary`, with
  `hard_geometry` meaning the drawing's measurements bind. The geometry rules it emits are typed in
  `packages/shared/src/reference-layout.ts` as `geometry_contract`: top-left origin, x right, y
  down, `anchor_space: "normalized_0_1"`, `stable_anchors_required`, `preserve_aspect_ratio`.
  **No accuracy claim.** The contract fixes a coordinate system and forbids editing the underlay. It
  does not assert that any produced layout is dimensionally correct against the original drawing,
  and we have measured no such thing.
- **Evidence grade:** **E2 - README only.** Implementation and accuracy unverified.
- **Limitations:** no model wiring, no schema, no output samples were inspected. Whether the
  separation actually holds end to end is unknown.
- **License / reuse boundary:** **no license file present.** Nothing may be reused verbatim,
  including prompt text.

### 4. Scrapstyle

- **Repository URL:** https://github.com/user2897/Scrapstyle
- **Commit SHA (reachable at retrieval):** `4202d00212cd0350559c0819c3addbe790645c59`
- **Tree at that commit:** https://github.com/user2897/Scrapstyle/tree/4202d00212cd0350559c0819c3addbe790645c59
- **Paths inspected** (immutable blob links pinned to the SHA above; search the tree link if a file
  has since moved):
  - [`extractor.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/extractor.ts)
  - [`screenshot.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/screenshot.ts)
  - [`formatter.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/formatter.ts)
  - [`templates.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/templates.ts)
  - [`route.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/route.ts)
  - [`constants.ts`](https://github.com/user2897/Scrapstyle/blob/4202d00212cd0350559c0819c3addbe790645c59/constants.ts)
- **Adopted principle:** derive a design system from a real page by reading computed style off a
  live DOM, then normalize the raw values into a small token set before anyone looks at them. The
  pipeline stays split into distinct stages: capture, extract, normalize, emit.
- **BurnGuard mapping (implemented):** what we took is the separation of evidence strength, not the
  scraping pipeline. `packages/backend/src/services/reference-layout-values.ts` classifies a
  reference into `hard_geometry`, `visual_inspiration`, or `mixed`, and
  `packages/backend/src/harness/skills/reference-layout-skill.ts` states the resulting rule: hard
  geometry controls page bounds, scale, dimensions, and anchor placement, while visual inspiration
  may guide composition or styling and never overrides hard geometry. This is **not** mapped to a
  design-system import path; BurnGuard has no such import built from this repository.
- **Evidence grade:** **E1 - executable source.** Read at the pinned commit, with the three kinds of
  observation kept apart:
  - screenshots produced by the capture step are **visual evidence** of a rendered result, not proof
    of any extraction rule;
  - computed style pulled from the live DOM gives **exact observed values**, and these are the only
    numbers we treat as measured;
  - recurring patterns in the emitted style guide are **inference** about intent, since a generated
    document is downstream of choices we did not audit.
- **Limitations:** we read the code, we did not run the pipeline against a corpus of sites. Coverage
  on dynamic pages, shadow DOM, and lazily applied styles is unmeasured. Nothing here says the
  extraction generalizes.
- **License / reuse boundary:** **no license file present.** Reading it for understanding is fine;
  copying code, structure-for-structure files, prose, or emitted templates is not. BurnGuard's
  implementation must be written independently.

## Cross-Cutting Limitations

- Three of the four repositories are **E2**, so most of the material here is described behavior, not
  observed behavior. Don't cite an E2 claim as a fact about how something works.
- Commit SHAs were reachable on 2026-08-25. Upstream history can be rewritten or repositories made
  private, so a later failure to fetch a SHA is expected drift, not evidence of error here.
- No repository was forked, vendored, or mirrored into BurnGuard.

## Reuse Boundary Summary

| Repository | License | Copying allowed | Influence allowed |
|---|---|---|---|
| graphic-design | none | No | Concept only |
| poster-design | none | No | Concept only |
| ZORY-AI | none | No | Concept only |
| Scrapstyle | none | No | Architecture-level principles only |

All four lack a license file, so default copyright applies to all of them. The working rule is
simple: read for ideas, write our own code, copy nothing.
