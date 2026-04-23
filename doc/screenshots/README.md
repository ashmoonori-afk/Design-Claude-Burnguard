# Screenshots

Images referenced by the top-level `README.md` and `README.ko.md`
Feature Tour sections. Drop a PNG at the documented path and the
existing `<img>` tags in both READMEs pick it up automatically on the
next GitHub render — no code changes required.

## Slots

| Path                       | Rendered width | Source resolution | Shown in                                       |
|----------------------------|----------------|-------------------|------------------------------------------------|
| `home.png`                 | 720 px         | 1440 × 900 (2×)   | Home tabs (Recent / Mine / Examples / Systems) |
| `new-project.png`          | 360 px         | 720 × 900 (2×)    | Sidebar with type tabs + DS picker             |
| `chat.png`                 | 720 px         | 1440 × 900 (2×)   | Chat pane, `cc\|cx` toggle, Revert affordance  |
| `canvas.png`               | 720 px         | 1440 × 900 (2×)   | Canvas iframe with mode toggle bar             |
| `canvas-tweaks.png`        | 540 px         | 1080 × 900 (2×)   | Tweaks inspector (color picker open)           |
| `design-system.png`        | 720 px         | 1440 × 900 (2×)   | DS detail view with 16 preview cards           |
| `ds-import.png`            | 540 px         | 1080 × 720 (2×)   | Home / Systems tab DS import form              |
| `export-menu.png`          | 320 px         | 640 × 480 (2×)    | Export dropdown showing 4 formats              |
| `settings.png`             | 640 px         | 1280 × 900 (2×)   | Settings modal with Chromium status + log tail |

## Conventions

- **Format:** PNG, 24-bit color, no transparency unless the screenshot
  genuinely has a transparent region (rare).
- **Resolution:** capture at 2× the rendered width so the scale-down
  stays crisp on retina displays. A 720 px slot means a 1440 px PNG.
- **Framing:** crop tight to the relevant surface — include enough
  chrome (tab bar, side nav) to anchor the reader, but drop the rest
  of the OS window.
- **Content:** prefer a realistic deck with the seeded tutorial data
  loaded. Avoid showing in-progress CLI runs or partial toasts unless
  the screenshot is specifically about that state.
- **Compression:** optimize with `pngquant` / `oxipng` before committing
  so binaries stay well under 500 KB. The whole directory target is
  &lt; 5 MB so clone size stays reasonable.

## Adding a new slot

1. Add a new `<img>` tag (with a matching row in `README.ko.md`) at
   the section it belongs to.
2. Append a row to the table above.
3. Commit the PNG alongside the README edits in a single commit
   (`docs(screenshots): add <path>`).
