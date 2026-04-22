# Goldman Sachs Design System

A working design system distilled from the public **`balajisr/gs-design-system-scss`** repo (a community SCSS recreation of GS color tokens) plus the official Goldman Sachs logo set. Built for prototyping branded interfaces, decks, and marketing artifacts in the GS visual language.

> **Sources**
> - GitHub: `https://github.com/balajisr/gs-design-system-scss` — color tokens (`src/_colors.scss`) and the full logo set (`src/assets/logos/`).
> - **Brand fonts (user-supplied):** **Zen Serif** for display, **KoPub Batang** (serif) for editorial body, **Pretendard** (variable) as the primary UI sans with **KoPub Dotum** as KR fallback, and **IBM Plex Mono** (CDN) for tabular numerals. Wired up in [`fonts/fonts.css`](./fonts/fonts.css).

This is **not** an official Goldman Sachs product. It's a designer's working kit for prototyping in a GS-inspired aesthetic.

---

## Index

| File / Folder | What's in it |
|---|---|
| [`README.md`](./README.md) | This file — overview, content & visual rules |
| [`SKILL.md`](./SKILL.md) | Agent-Skill manifest (drop into Claude Code) |
| [`colors_and_type.css`](./colors_and_type.css) | All CSS custom properties — colors, type, spacing, radii, shadows, motion |
| [`fonts/`](./fonts/) | `fonts.css` (Google-Fonts substitution layer + notes) |
| [`assets/logos/`](./assets/logos/) | All 6 logo lockups in PNG + SVG (Blue Box, Outline, Reversed, Secondary, Signature, Signature Reverse) |
| [`preview/`](./preview/) | Cards rendered in the Design System tab — colors, type, spacing, components |
| [`ui_kits/website/`](./ui_kits/website/) | Marketing-website kit: header, hero, article, data callout, footer, full landing page |

---

## Brand snapshot

Goldman Sachs is a 150-year-old American multinational investment bank. The visual language is **institutional, restrained, and editorial** — closer to a serious newspaper or annual report than a tech product. The wordmark uses a high-contrast Didone serif; the supporting palette is built on cool blue-grays with the dusty `#7399C6` "GS Blue" as the brand color.

The system is meant to feel **trustworthy, considered, and quiet**. There is no playfulness. The few moments of color are reserved for data and status.

---

## CONTENT FUNDAMENTALS

**Voice.** Authoritative, restrained, third-person institutional. Goldman Sachs writes about itself in the third person ("Goldman Sachs is…"), and addresses readers as "our clients," "investors," "the market." Direct second-person ("you") appears in CTAs and product UI, but rarely in editorial.

**Tone.** Considered, evidence-led, never breathless. Headlines state a thesis or a fact; subheads provide context. Marketing copy avoids superlatives ("best-in-class," "revolutionary"). Numbers carry the weight that adjectives would in a startup voice.

**Casing.**
- **Title Case** for headlines and section titles ("Global Markets Outlook 2026").
- **Sentence case** for body and supporting copy.
- **ALL-CAPS eyebrows** with tracked letter-spacing (`0.14em`) for category labels: `INSIGHTS`, `Q1 2026`, `MARKETS`.

**Numerals & units.** Tabular figures everywhere a number can be compared (use `font-feature-settings: 'tnum'`). Money: `$1.2B`, `$485M`, `2.3%`. Years standalone: `2026`. Currency before figure for USD; ISO codes (USD, JPY, EUR) when ambiguous.

**Emoji.** Never. Not in product, not in marketing, not in internal tools.

**Vibe.** Editorial-financial. Think *The Economist* meets a research note. Long-form prose is welcome; whitespace is generous.

**Examples (in the GS voice):**
- ✅ "Equity markets enter the second quarter on firmer footing."
- ✅ "Our research desk expects a 25 bp cut at the June meeting."
- ✅ "Insights from Goldman Sachs Research"
- ❌ "🚀 Markets are crushing it this quarter!"
- ❌ "We think you're gonna love what's coming next."

---

## VISUAL FOUNDATIONS

**Colors.** A 10-step gray ramp from `#FFFFFF` to `#1C2B36` carries 90% of the surface area. The dusty **`#7399C6` "GS Blue"** is reserved for the wordmark and rare brand moments. **`#186ADE` action-blue** drives interactive states (links, buttons, focus). Accent hues (red, orange, green, teal, purple, pink) exist as full 10-step ramps but appear almost exclusively in **data visualization** and **status messaging** — never as decoration.

**Type.** Display in **Zen Serif** (brand) at large sizes with tight tracking (`-0.02em`). Editorial body & long-form in **KoPub Batang** (serif). UI labels, eyebrows, and shorter copy in **Pretendard** (variable, 100–900) with KoPub Dotum as KR fallback. Numerals in **IBM Plex Mono** (tabular).

**Spacing.** A strict **4px grid**: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80`. Editorial layouts breathe — section padding is typically 80–120px vertical.

**Backgrounds.** Predominantly **white** (`--gray-100`) or **near-white** (`--gray-10` `#F2F5F7`). The single dark variant is `--gray-90` `#1C2B36` for inverse sections. **No gradients.** No textures. No noise. No hand-drawn illustration. Imagery is **photographic**, cool-toned, often architectural or human portraits with neutral grading — never warm or saturated.

**Animation.** Minimal. Standard easing is `cubic-bezier(0.2, 0, 0, 1)` at `200ms` for state changes, `120ms` for micro-interactions. No bounces, no spring physics, no parallax. Fades and short slides only.

**Hover states.** Links underline. Buttons darken by ~10% (move to `blue-70` from `blue-60`). Cards lift to `--shadow-3`. No glow, no scale.

**Press states.** Move to the next-darker stop in the color ramp (`blue-80`). No shrink or scale transform.

**Borders.** `1px solid var(--border)` (`--gray-20` `#DCE3E8`) is the default. Strong borders use `--gray-30`. Border-radius is **conservative**: 0px (editorial blocks), 2px (inputs/badges), 4px (buttons), 8px (cards). Never pill-shaped except on filter chips.

**Shadows.** Four-tier elevation system (see `--shadow-1`…`--shadow-4`). All shadows are cool gray (`rgba(28, 43, 54, …)`), never warm. Used sparingly — most cards rely on a 1px border instead of a shadow.

**Capsules vs. protection gradients.** Neither. The brand sits on solid color or imagery with sufficient contrast — it does not use scrim gradients or capsule pills behind copy.

**Layout.** Strict 12-column grid. Generous gutters (24–32px). Editorial layouts often go asymmetric (8/4 splits) with copy on the wider column. Fixed elements: top navigation only. No floating action buttons, no sticky sidebars in marketing.

**Transparency & blur.** Almost never. The aesthetic is opaque and printed-paper-like. The one exception is a subtle 80% white overlay on hero images to seat copy.

**Imagery vibe.** Cool-toned, low-saturation, often desaturated to near-monochrome. Architecture, trading floors, hands at keyboards, considered portraits. **Never** stock-photo handshakes, lens flares, or warm sunset palettes.

**Cards.** White surface, 1px `--border`, `8px` radius, `--shadow-1` at rest. Padding is `24–32px`. Hover lifts to `--shadow-3`.

---

## ICONOGRAPHY

The Goldman Sachs brand uses **photography** and **typography** as its primary visual language — iconography is a supporting role and is held to a strict, neutral system.

- **Logo lockups.** Six official lockups live in `assets/logos/`:
  - `Goldman_Sachs_Signature` — primary, black on white
  - `Goldman_Sachs_Signature_Reverse` — primary, white on dark
  - `Goldman_Sachs_Blue_Box` — square brand mark on `#7399C6`
  - `Goldman_Sachs_Reversed` — white wordmark for dark backgrounds
  - `Goldman_Sachs_Outline` — line treatment
  - `Goldman_Sachs_Secondary` — secondary lockup
- **UI icons.** The repo does not ship an icon set. We standardize on **[Lucide](https://lucide.dev)** loaded from CDN — a thin, geometric, 1.5px-stroke open-source set that matches the GS restraint. Lucide's stroke weight and squared terminals fit the editorial tone better than thicker rounded sets.
  - **Substitution flagged.** If GS publishes an internal icon set, swap the CDN reference in `ui_kits/website/index.html`.
- **No emoji.** Anywhere.
- **No unicode pictographs as icons** (★, ✓, →) except the en-dash and bullet (·) used as typographic separators in eyebrows: `INSIGHTS · MARKETS · Q1 2026`.
- **No hand-drawn SVG illustration.** Where a visual is needed, use photography.

---

## Caveats & substitutions to flag

1. **Icon set → Lucide.** The repo ships no icons. If GS uses an internal set, replace the Lucide CDN.
2. **Tokens limited to color.** The source repo only defines colors. Spacing, type scale, radii, shadows, and motion are reasonable derivations consistent with editorial-finance peers — verify against any internal GS guidelines you have.
3. **Mono → IBM Plex Mono (CDN).** No brand mono was supplied. Swap if you have one.

