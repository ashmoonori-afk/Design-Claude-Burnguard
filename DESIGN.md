# BurnGuard Design System

## Product stance

BurnGuard is a local-first design workspace, not a generic AI chat shell. The
canvas is the primary surface; chat, inspection, edits, comments, and undo are
supporting tools that should keep the user's visual context intact. The
interface should feel precise, quiet, and reversible.

The visual direction combines premium utilitarian minimalism with Linear-like
workspace precision. The existing blue brand accent remains the action color;
neutral surfaces carry hierarchy so a selected artifact is more important than
the chrome around it.

## Tokens

### Color

- `background`: `#ffffff`
- `foreground`: `#17191a`
- `muted`: `#f1f3f5`
- `muted-foreground`: `#5e646c`
- `border`: `#dce4ea`
- `accent`: `#004fff`
- `accent-soft`: `#ecf4ff`
- `success`: `#00ce78`
- `warning`: `#fca63d`
- `danger`: `#d92d20`
- `canvas-ink`: `#111111`

Use semantic Tailwind tokens instead of new one-off colors. Accent is reserved
for the next meaningful action, selection focus, and keyboard focus rings.
Danger is reserved for destructive or unrecoverable states.

### Type

- UI: the existing system sans stack, with `font-sans` and normal sentence
  case for user-facing copy.
- Artifact metadata and selectors: `font-mono`, compact, and scannable.
- Labels: 10–12px uppercase only for secondary section labels; never use
  uppercase for primary actions or instructions.
- Body line-height: at least 1.45. Do not use tracking-tight for body copy.

### Shape and spacing

- 1px borders use `border-border`.
- Functional controls use 6–8px radii; badges may use full rounding.
- Use the existing 4px spacing scale. Keep panel gutters at 12–16px.
- Keep the canvas free of decorative cards; use one clear work surface and
  one contextual inspector.

## Component anatomy

- **CanvasTopBar**: mode controls, refresh, and file-level undo. Each action
  has an accessible name and a disabled state when unavailable.
- **SelectorOverlay**: hover and selected bounds. Selection must preserve
  element identity, computed styles, and an authoring anchor when one exists.
- **SelectorReadOnlyPanel**: selected identity and computed/token context. When
  the authoring anchor is available, it exposes the next inline action without
  forcing the user to reselect the element in another mode.
- **TweaksPanel**: focused, editable token controls. Save is an explicit
  checkpoint; reset and undo remain visible and reversible.
- **CommentPanel**: contextual feedback tied to an artifact path and optional
  slide index. Resolved comments leave the active queue.
- **ChatPane**: intent entry and streaming state. Chat must not obscure the
  artifact or imply a completed update before the backend event arrives.

## State and interaction rules

- First run: explain the canvas and the next action without blocking creation.
- Empty: provide one clear action and avoid fake content.
- Loading: preserve the last stable artifact while showing what is pending.
- Error: name the failed operation, preserve the user's input, and offer retry
  or recovery. Never fail silently.
- Saving: disable duplicate submission and show a local checkpoint state.
- Saved: surface the changed artifact and make undo discoverable.
- Cancelled/interrupted: keep the last stable artifact and make retry safe.
- Keyboard: every toolbar action and inspector control is reachable in order;
  focus is visible with the accent ring.
- Reduced motion: state changes remain understandable without transitions.

## Motion

Use short opacity/color transitions for mode changes and selection feedback.
Avoid layout movement during streaming. Under `prefers-reduced-motion: reduce`,
remove non-essential transitions and preserve the same visible state changes.

## Responsive behavior

- Desktop: chat, canvas, and the contextual inspector share the viewport
  without nested horizontal scrolling.
- Narrow viewport: the inspector becomes a full-width contextual section below
  the canvas; controls remain at least 44px high where touch is plausible.
- Long selectors and file paths truncate visually but remain available in a
  `title` or accessible description.

## Evidence expectations

Every new behavior needs a focused RED -> GREEN proof and a real app scenario.
Visual review covers desktop and narrow viewport screenshots, keyboard focus,
empty/loading/error/recovery states, and reduced motion. Generated artifacts
must remain understandable on disk and reversible through the existing file
patch and undo contracts.
