# Live recon: Claude Design first-party pages

Task `st_019ffa58`. All observations captured **2026-08-13T08:50:17Z – 08:54:02Z**.

## Provenance classification

| Class | Used? | Detail |
|---|---|---|
| **LIVE (direct origin)** | YES — all 5 URLs | Two independent routes agree: raw `curl` HTTP/1.1 to origin, and Playwright Chromium 1.54.0 real navigation. Fresh `Date:` headers matching wall clock, `Set-Cookie: __cf_bm` challenge cookies minted per request, `CF-Ray` IDs unique per fetch. |
| **SNAPSHOT (archive)** | NO | No archive.org / cache: fallback needed or used. |
| **PROXY (3rd-party reader)** | NO | No r.jina.ai, no text-extraction proxy, no search-engine cache. |

Caveat, stated precisely: `claude.com/product/design` returned `CF-Cache-Status: DYNAMIC` with `Age: 43879` and `surrogate-control: max-age=432000`, i.e. the response was served from **Anthropic's own Cloudflare/Fastly edge cache** (`Last-Modified: Wed, 12 Aug 2026 21:28:11 GMT`). That is first-party edge caching, not third-party snapshotting — still LIVE provenance, but the body can trail an origin publish by up to the surrogate TTL. `anthropic.com` and `support.claude.com` returned `Cache-Control: private, no-cache, no-store` / Intercom no-cache, so those are uncached origin reads.

No CAPTCHA, no Cloudflare interstitial, no 403, no robots block on any of the 5 URLs. Desktop Chrome UA was sent; no auth was used or needed.

## Per-URL observed status

| # | URL | HTTP | Title | Capture UTC | Screenshot |
|---|---|---|---|---|---|
| 1 | `https://claude.com/product/design` | **200** (0 redirects) | `Claude Design \| Turn Ideas into Design \| Claude by Anthropic` | 08:53:42Z | `.omo/recon/shots/design.png`, `design-full.png` |
| 2 | `https://www.anthropic.com/news/claude-design-anthropic-labs` | **200** (0 redirects) | `Introducing Claude Design by Anthropic Labs \ Anthropic` | 08:53:47Z | `.omo/recon/shots/announce.png`, `announce-full.png` |
| 3 | `https://support.claude.com/en/articles/14604416-get-started-with-claude-design` | **200** | `Get started with Claude Design \| Claude Help Center` | 08:53:53Z | `.omo/recon/shots/art-getstarted.png`, `-full.png` |
| 4 | `https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design` | **200** | `Set up your design system in Claude Design \| Claude Help Center` | 08:53:58Z | `.omo/recon/shots/art-designsystem.png`, `-full.png` |
| 5 | `https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them` | **200** | `What are artifacts and how do I use them? \| Claude Help Center` | 08:54:02Z | `.omo/recon/shots/art-artifacts.png`, `-full.png` |

Also probed: `https://support.claude.com/` → **302** → `/en/` (expected locale redirect).

Artifacts: raw HTTP bodies in `.omo/recon/raw/*.html` (+ `.hdr` response headers), rendered DOM in `.omo/recon/rendered/*.html`, rendered visible text in `.omo/recon/rendered/*.txt`, machine manifest in `.omo/recon/capture-manifest.json`.

Page-declared freshness: article 3 `dateModified 2026-08-06T22:41:48Z` ("Updated this week"), article 4 `dateModified 2026-08-06T22:41:07Z` ("Updated this week"), article 5 `dateModified 2026-07-22T00:16:36Z` ("Updated over 3 weeks ago"). Announcement byline date **Apr 17, 2026**.

## 1. claude.com/product/design — current visible copy

Meta description (= og:description): *"Describe a prototype, deck, or one-pager, and Claude builds a draft. Refine it yourself, or hand it off to your tools or Claude Code. You're the designer, from start to finish."*

- Announcement toast (rotating carousel, slide 1 of N): **"Claude Design stays on brand for daily work"** — *"New design system import, editor and Claude Code sync, higher shared limits, more connected apps."* → `See what's new`
- Hero: **"Your idea, designed with Claude"** + `Start designing`, `Play video`
- Section **"Frontier intelligence for every type of design work"**: Prototypes ("No PRs, no code review") · Wireframes and mockups · Design explorations ("a dozen directions in minutes") · Pitch decks ("Export to PPTX") · Marketing collateral · Documents ("export to PDF")
- Section **"How it works" / "Idea to visual in minutes"**:
  - *Build in your design system.* "Import from GitHub, design files, or your local codebase… The output looks like your company, not a template."
  - *Move between Claude Design and Claude Code* — "Pull in your design system from Claude Code using **/design-sync** or work directly in Claude Code with **/design**."
  - *Fine-grained control* — "Comment on any element, edit text directly, or use the adjustment sliders Claude creates… including to **drag, resize, and align elements directly**."
  - *From the canvas to the tools you use* — "Export reliably to PDF and PowerPoint… connectors now includes Adobe, Canva and more."
- Partner quote carousel (7 slides, all present in DOM): Adobe (Govind Balakrishnan), Lovable (Fabian Hedin), Replit (Michele Catasta), Miro (Jeff Chow), Wix (Hagit Kauffman), Vercel (Andrew Qu), Gamma (Jon Noronha).
- FAQ (verbatim, load-bearing):
  - *What is Claude Design?* — "an Anthropic **beta** product… It's early, and we're shipping improvements often."
  - *Which plans include it?* — "**beta** on Claude Pro, Max, Team, and Enterprise… Start designing at claude.ai/design"
  - *Enterprise* — "**off by default.** An admin can enable it in Organization settings."
  - *Import/export* — "Import from your codebase, a web capture, or **DOCX, PPTX, XLSX**. Export to **PPTX, PDF, or HTML**, share an org-scoped link, hand off to Claude Code… connectors now includes **Adobe, Base44, Canva, Gamma, Lovable, Miro, Replit, Vercel and Wix**."
  - *Brand match* — "Bring in **one or several design systems** from a GitHub repo, design files, or raw uploads. Claude builds with your components, **checks its output against your design system, and makes corrections before you see it.** For larger teams, a new **admin role can approve one standard system and lock down edits**."
  - *Usage limits* — "**shares usage limits with chat, Claude Cowork, and Claude Code.**"

## 2. anthropic.com/news/claude-design-anthropic-labs — current visible copy

Dated **Apr 17, 2026**, category Product / Announcements. Declares Claude Design an **Anthropic Labs** product, "powered by our most capable vision model, **Claude Opus 4.7**", available in **research preview** to Pro/Max/Team/Enterprise.

Use cases listed: realistic prototypes · product wireframes and mockups · design explorations · pitch decks and presentations · marketing collateral · **frontier design** ("voice, video, shaders, 3D and built-in AI").

"How it works" pillars: *Your brand, built in* (onboarding reads codebase + design files; teams can maintain more than one system) · *Import from anywhere* (text, images, DOCX/PPTX/XLSX, codebase, **web capture tool**) · *Refine with fine-grained controls* (inline comments, direct text edit, adjustment knobs, "apply your changes across the full design") · *Collaborate* (org-scoped sharing: private / view / edit + group conversation) · *Export anywhere* (internal URL, folder, **Canva, PDF, PPTX, standalone HTML**) · *Handoff to Claude Code* ("handoff bundle… with a single instruction").

Customer quotes: Canva (Melanie Perkins), Brilliant (Olivia Xu — "20+ prompts in other tools, only 2 prompts in Claude Design"), Datadog (Aneesh Kethini).

Get started: subscription-included, "option to continue beyond those limits by enabling **extra usage**"; Enterprise **off by default**; "Start designing at claude.com/product/design".

## 3–5. Support articles — current visible copy

**Get started with Claude Design** (12,151 chars rendered): two-pane model (chat left, canvas right); flow = create project → attach/import design system → add context → describe → review → refine → export. **Claude Design MCP server** documented verbatim: `claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp`, then `/design-login`. `/design-sync` pulls the design system from Claude Code. **Claude Design Admin custom role** can approve a standard system and lock edits. Export menu enumerated: Download as .zip · PDF · PPTX · Send to Canva · standalone HTML · send to Adobe/Base44/Canva/Gamma/Lovable/Miro/Replit/Vercel/Wix · Handoff to Claude Code · Send to local coding agent · Send to Claude Code Web. Versioning is conversational only ("Save what we have and try a completely different approach"), not named branches. **Usage:** "counts toward the same usage limits as the rest of Claude… shared pool you use for chat, Claude Code, and Cowork" + explicit note "Claude Design **previously had its own weekly allowance**… now counts toward your plan's shared limits." **Known limitations (verbatim):** comment persistence (inline comments occasionally don't appear); large codebases cause lag/browser issues; "chat upstream error" workaround = new chat tab; **web and desktop only**; multi-person simultaneous editing "still basic and may not work reliably"; "design system import is only as good as its source."

**Set up your design system in Claude Design** (5,359 chars): one-time, per-organization, done by designer/brand owner with admin-granted permission. Sources: codebase/component library, prototypes/screenshots/web flows, slide decks or PDFs, individual assets (logos, palettes, type specimens). Steps: create/switch org → upload assets → review generated **UI kit** (color palette, typography, components, layout patterns) → validate with a test project → flip the **"Published" toggle** so org projects use it. Updating = org settings → "Open" → **"Remix"** to chat-edit the system.

**What are artifacts and how do I use them?** (10,722 chars): artifact trigger criteria (self-contained, typically **over 15 lines**, reusable, referenceable); types (Markdown/text docs, code, single-page HTML, SVG, diagrams, interactive React). **Hard requirement:** "We no longer support artifacts without **Code execution and file creation** enabled in Settings > Capabilities (Free/Pro/Max) or Organization settings > Capabilities (Team/Enterprise)." Artifacts do not auto-appear in the sidebar — must click **Publish**. Version selector, in-place Markdown "Edit with Claude", batched multi-file edit requests.

## Blocked / dynamic-content notes

- **Nothing was blocked.** 5/5 targets returned 200 to both routes; no challenge page, no auth wall, no rate limit.
- **Auth-gated surface not in scope and not attempted:** the actual product at `claude.ai/design` requires a logged-in Pro/Max/Team/Enterprise session; all feature claims above are marketing/support copy, **not** observed product behavior.
- **claude.com/product/design is Webflow-served and fully server-rendered** — 688 KB static HTML already contains every FAQ answer and all 7 partner quotes. Static and rendered routes agreed; no JS gate.
- **Carousels hide content from screenshots, not from the DOM.** The announcement toast and the partner-quote strip are `Next`/`Prev` sliders — a viewport screenshot shows one slide. Full copy was recovered from DOM, so the screenshots under-represent the page. Treat `design.png` as illustrative, `rendered/design.txt` as authoritative.
- **`Play video` hero asset was not exercised** (no video transcript captured).
- **support.claude.com inlines the entire help-center nav** (~330–360 KB, 347 sidebar items) ahead of the article body, so naive static scraping returns navigation, not content. Article bodies were recovered from the **rendered DOM** (`DocsArticleBody_body__*`). Any prior synthesis built from raw-HTML head-slicing of these URLs likely captured nav chrome only.
- **anthropic.com is Next.js with `Cache-Control: private, no-store`**; content is SSR so no hydration wait was required beyond `networkidle`.

## Conflicts between the announcement and current live pages

These matter because the recovered synthesis cites both as if concurrent. The announcement is **~4 months stale** and contradicted by current pages:

1. **Status:** announcement says "**research preview**"; product page FAQ and both support articles now say "**beta**".
2. **Usage model:** announcement says design draws subscription limits with optional "extra usage"; the support article states Claude Design **previously had its own weekly allowance** and now shares one pool with chat / Claude Code / Cowork. The shared-pool model is the current one.
3. **Connectors:** announcement names **Canva** only; current pages name **nine** destinations (Adobe, Base44, Canva, Gamma, Lovable, Miro, Replit, Vercel, Wix) plus "more coming soon".
4. **Not in the announcement at all, live now:** the Claude Design **MCP server** + `/design-login`, `/design-sync`, `/design` slash commands, the **Claude Design Admin** custom role with lock-down, multi-design-system support, automatic self-check of output against the design system, and **drag/resize/align** direct-manipulation layout controls.
5. **Model attribution:** only the announcement names a model (**Claude Opus 4.7**); no current page repeats it. Do not present it as current.

## EXPAND

Unresolved threads, ranked by value to the BG backlog:

- **E1 — Claude Design admin guide** (`support.claude.com/.../claude-design-admin-guide-for-team-and-enterprise-plans`, surfaced in the live sidebar, not in the cited set). Directly governs BG-16/BG-19 assumptions about approved-system locking. Highest value uncaptured page.
- **E2 — `/v1/design/mcp` contract.** The MCP endpoint is documented but its tool surface is unverified. Requires an authenticated session; would firm up BG-02/BG-07 CLI-contract work with a real invocation fixture.
- **E3 — "See what's new" changelog target** behind the announcement toast, plus `support.claude.com/en/collections/...release-notes`. Would date each capability precisely instead of inferring drift from a 4-month-old announcement.
- **E4 — Remaining carousel slides / `Play video` asset** on the product page: DOM text is captured, but slide imagery and the demo video are not. Only matters if visual fidelity of the marketing surface is needed.
- **E5 — Sibling support articles** now visible in the live nav and plausibly relevant: "Use visual and interactive content on Team and Enterprise plans", "Custom visuals in chat and Cowork", "Publish and share artifacts", "Use Claude for PowerPoint". Relevant to BG-13/BG-20 PPTX scope.
- **E6 — Provenance hardening:** re-fetch `claude.com/product/design` with `Cache-Control: no-cache` or a cache-buster to confirm the edge-cached body equals origin, eliminating the `Age: 43879` caveat.
- **E7 — Cross-check the recovered synthesis line-by-line** against `.omo/recon/rendered/*.txt` and strike any claim traceable only to the stale announcement (see Conflicts 1–5).
