import { escapeHtml } from "./index";

export interface SlideDeckOptions {
  use_speaker_notes?: boolean;
}

/**
 * Initial slide deck skeleton. The `<section data-slide>` convention is the
 * shared contract between:
 *   - deck-stage.js runtime (pagination + keyboard nav)      — P2.2
 *   - Claude Code deck-aware prompt builder (SKILL-deck.md)  — P2.3
 *   - PDF/PPTX exporters                                     — P2.7 / P2.8
 *
 * Before the runtime loads, every slide stacks vertically (valid HTML preview).
 * Once the runtime boots it sets `data-deck-ready` on <body>, a CSS rule hides
 * non-active slides, and keyboard nav takes over. This graceful-degradation
 * ordering matters: a canvas that opens the file directly (without Vite/proxy)
 * should still render something readable.
 */
export function renderSlideDeck(
  projectName: string,
  options: SlideDeckOptions,
): string {
  const title = escapeHtml(projectName);
  const useSpeakerNotes = Boolean(options.use_speaker_notes);

  const notesBlock = (body: string) =>
    useSpeakerNotes
      ? `\n      <aside class="deck-notes" data-speaker-notes>${body}</aside>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Variable Text", sans-serif;
      background: #0b0d12;
      color: #18232d;
    }

    /* Before deck-stage.js boots every slide is visible stacked; after boot,
       body[data-deck-ready] kicks in and only the active slide renders. */
    body[data-deck-ready] .deck-slide:not([data-active]) {
      display: none;
    }
    body[data-deck-ready] .deck-slide {
      position: fixed;
      inset: 0;
    }

    .deck-slide {
      aspect-ratio: 16 / 9;
      width: 100%;
      max-height: 100vh;
      background: #ffffff;
      padding: 64px;
      display: grid;
      place-items: center;
      border-bottom: 1px solid #e7dece;
    }
    .deck-slide > .deck-body {
      max-width: 920px;
      width: 100%;
    }
    .deck-slide.deck-cover {
      background: linear-gradient(180deg, #0b0d12 0%, #1a2330 100%);
      color: #ffffff;
    }
    .deck-slide.deck-closing {
      background: #f6f1e8;
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #e06b4c;
      margin-bottom: 20px;
    }
    .deck-slide.deck-cover .eyebrow {
      color: rgba(255, 255, 255, 0.7);
    }
    h1, h2 {
      margin: 0;
      letter-spacing: -0.03em;
    }
    h1 { font-size: 64px; line-height: 1.02; }
    h2 { font-size: 44px; line-height: 1.08; }
    p {
      margin-top: 24px;
      font-size: 20px;
      line-height: 1.55;
      color: inherit;
      opacity: 0.85;
    }
    .deck-slide.deck-cover p { color: rgba(255, 255, 255, 0.75); }

    .deck-notes {
      display: block;
      margin-top: 24px;
      padding: 12px 16px;
      border-left: 3px solid #e06b4c;
      background: rgba(224, 107, 76, 0.06);
      font-size: 13px;
      line-height: 1.55;
      color: #52616c;
    }
    body[data-deck-ready] .deck-notes { display: none; }
    body[data-deck-ready][data-presenter] .deck-notes { display: block; }
  </style>
</head>
<body>
  <section data-slide class="deck-slide deck-cover" data-bg-node-id="slide-1">
    <div class="deck-body">
      <div class="eyebrow">BurnGuard Deck</div>
      <h1 data-bg-node-id="slide-1-title">${title}</h1>
      <p data-bg-node-id="slide-1-subtitle">Send your first prompt in chat to expand this deck.</p>${notesBlock("Opening cue: introduce the topic and set the stakes.")}
    </div>
  </section>

  <section data-slide class="deck-slide" data-bg-node-id="slide-2">
    <div class="deck-body">
      <div class="eyebrow">Section 01</div>
      <h2 data-bg-node-id="slide-2-title">Your first slide</h2>
      <p data-bg-node-id="slide-2-body">Replace this content via chat. Use arrow keys or space to navigate once the deck runtime loads.</p>${notesBlock("Talk through the key point in 30 seconds.")}
    </div>
  </section>

  <section data-slide class="deck-slide deck-closing" data-bg-node-id="slide-3">
    <div class="deck-body">
      <div class="eyebrow">Closing</div>
      <h2 data-bg-node-id="slide-3-title">Thanks</h2>
      <p data-bg-node-id="slide-3-body">End of deck. Append more &lt;section data-slide&gt; blocks to grow it.</p>${notesBlock("Invite questions.")}
    </div>
  </section>

  <script src="/runtime/deck-stage.js" defer></script>
</body>
</html>`;
}
