# Dracula Built-in Theme

A dark violet-gray system with bright pink, purple, amber, cyan, and green accents.

## Files

- `colors_and_type.css` - canonical BurnGuard color, type, spacing, and shape tokens
- `SKILL.md` - concise artifact-generation guidance

## Token mapping

The source theme's base surface ladder maps to `--bg`, `--bg-subtle`, and `--bg-muted`. Primary maps to `--primary-blue` and `--action-blue`; semantic colors retain direct paired `--fg-on-*` tokens. Selector, field, and box radii map to `--r-selector`, `--r-field`, and `--r-box`; the source border width maps to `--border-width` because BurnGuard reserves `--border` for a color.

## Provenance

Derived from the daisyUI `dracula` theme: https://github.com/saadeghi/daisyui/blob/master/packages/daisyui/src/themes/dracula.css

Licensed under the MIT License, Copyright (c) 2020 Pouya Saadeghi. Source OKLCH values were converted offline to sRGB, gamut-clipped, and rounded to the nearest 8-bit channel. See the repository `NOTICE` file.
