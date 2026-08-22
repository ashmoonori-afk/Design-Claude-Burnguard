# Ultrawork Notepad — Design BurnGuard inline design vibe coding
Started: 2026-08-22

## Plan (exhaustively detailed)
1. Register the concise product outcome and acceptance gates in the durable ulw-loop state.
2. Audit the current branch, instructions, monorepo layout, application entry points, tests, and preserved .omo evidence without changing tracked code.
3. Research the named reference repositories and current paid personal products from primary sources; write a source ledger and competitor matrix.
4. Convert findings into a smallest coherent inline-design vertical slice and explicit interaction/state contract.
5. Capture failing-first behavior proofs, implement the slice in the existing frontend/backend/shared seams, and verify focused checks.
6. Dogfood the real macOS BurnGuard app through its matching surface, capture desktop and narrow viewport UX evidence, and iterate on observed defects.
7. Audit reliability, privacy/security, performance, exportability/undo, accessibility, and regression gates; run full validation.
8. Stamp evidence to the current tree, clean every QA resource, checkpoint the durable loop, and report verified, attempted, blocked, and deferred work.

## Success criteria + QA scenarios
- Product loop: real app prompt -> live canvas -> select/inspect -> inline edit/comment -> code/diff -> undo -> next iteration; pass only with real transcript and screenshots.
- UX: first-run, empty/loading/error/cancel/recovery, keyboard/focus/contrast/hit targets/reduced motion, desktop and narrow viewport; pass only with browser action logs and screenshots.
- Reliability: contracts, streaming lifecycle, cancel/reconnect, checkpoint/undo, error recovery; pass only with RED-before-GREEN tests and real-app behavior.
- Privacy/security: local-first boundaries, no secret leakage, safe untrusted artifact handling; pass only with source review and executable checks.
- Performance/ownership: measured first usable canvas and inline update, bounded context, no unnecessary polling, exportable understandable reversible source; pass only with benchmark and artifact evidence.
- Repository gates: real tests, typecheck, build, smoke, and macOS app run pass; evidence is current-tree stamped and cleaned.
- Research: reference source ledger and dated primary-source paid-product matrix explain the differentiated $9+/month value and remaining gaps.
- Stop: stop right away when every gate has current-tree evidence, all spawned QA resources/workers are clean, and the durable ulw-loop checkpoint is complete.

## Now
Registering the refined durable goal and preserving the previous generated plan as an unrelated historical artifact.

## Todo
Bootstrap: audit repository; research references and paid products; write thesis/source ledger/matrix.
Vertical Slice: define contract; write RED tests; implement; verify focused checks.
Quality Gates: dogfood; capture UX comparison; audit quality; iterate.
Closeout: full validation; record evidence and checkpoint; review and report.

## Findings
- The complete brief is at `/Users/MoonGwanghoon/.hermes/artifacts/design-burnguard-inline-vibe/brief.md` and has been read before edits.
- The first CLI invocation generated an unrelated 47-goal aggregate under `.omo/ulw-loop/01a029cd-0631-7f4f-a323-b51c5ebf9043`; it remains untouched to preserve history.
- A fresh concise aggregate was created under `.omo/ulw-loop/design-burnguard-inline-vibe-20260822/`.
- Tier: HEAVY because this mission changes a new cohesive product loop and crosses frontend/backend/shared behavior with security, reliability, performance, and real-app UX gates.
- Delegation verdict: parallel read-only research/audit lanes pay off because their scopes are independent; shared-contract design and implementation remain sequential in the lead checkout to avoid edit collisions.

## Learnings
- Goal criteria generated automatically from a long brief are too vague; replace them through ulw-loop steering before execution.
- Preserve existing `.omo` history; use a fresh session id rather than force-overwriting prior state.

## Checkpoint 2026-08-22T14:15Z
- Durable goal is active through `.omo/ulw-loop/design-burnguard-inline-vibe-20260822/`; `complete-goals --session-id design-burnguard-inline-vibe-20260822` selected the fresh session without overwriting the earlier aggregate.
- Existing product already has a React/Vite frontend, Bun/Hono backend, shared TypeScript contracts, iframe canvas, Select/Tweaks/Comment/Edit/Draw modes, SSE session events, file patching, checkpoint restore, comments, and single-step file undo.
- Core seams read: `packages/frontend/src/views/ProjectView.tsx`, `packages/frontend/src/components/canvas/{Canvas,SelectorOverlay,EditLayer,TweaksLayer,CanvasTopBar}.tsx`, `packages/frontend/src/components/modes/{ModePanel,SelectorReadOnlyPanel,TweaksPanel,EditPanel,CommentPanel}.tsx`, `packages/frontend/src/api/{files,checkpoints}.ts`, `packages/shared/src/file-patch.ts`, `packages/backend/src/routes/artifacts.ts`.
- Existing selector panel explicitly says read-only Phase 1 and editable CSS fields ship in Phase 3; this is the clearest product gap for a vertical slice.
- Existing backend test suite is substantial under `packages/backend/tests`; no frontend test files were found by the initial inventory. Existing `.omo/ulw-loop/evidence/bg-01/red-mutation.txt` records a historical unrelated request-authority failure from a Windows path and is not current-tree evidence.
- Existing preserved research includes `.omo/recon/LIVE-RECON.md`, `.omo/ulw-research/20260813-113143/sources-ledger.md`, and a design specification; none was overwritten.
- Skill routing used: `programming` for TypeScript/TDD; `frontend` plus design-system architecture, redesign, interaction, layout, StyleGallery, ui-ux-db, and perfection references for the app surface; `visual-qa` for real browser evidence; `debugging` for runtime failures; `git-master` only when atomic commits are authorized/needed. `ux-audit` delegation was inconclusive because its provider account was rate-limited, so the lead must perform that audit.
- Parallel workers: architecture audit completed (task `st_01a029d3`, compact resend requested); reference research completed (task `st_01a029d4`, compact resend requested); paid products completed (task `st_01a029d5`, compact resend requested); UX audit failed due provider rate limit (task `st_01a029d6`), not an approval.

## RED 2026-08-22T14:20Z — selection bridge
- Test added at `packages/frontend/src/components/modes/selection-bridge.test.ts`.
- Command: `bun test packages/frontend/src/components/modes/selection-bridge.test.ts`.
- RED captured: expected `selectedNodeToTweaksTarget` to be a function, received `undefined`; this is the intended missing product seam, not a syntax/import failure.
- Product outcome: selecting an element should carry its authoring anchor and computed token context into the inline Tweaks surface without forcing a second canvas hit-test.

## GREEN 2026-08-22T14:25Z — selection bridge
- Implemented the bridge in `frame-bridge.ts`, `SelectorOverlay.tsx`, `types/project.ts`, `SelectorReadOnlyPanel.tsx`, `ModePanel.tsx`, and `ProjectView.tsx`.
- The sandbox bridge now returns `bgId` and inline styles for authored elements; Select carries them into the inspector; `Open in Tweaks` reuses the selected context and preserves the existing reversible patch/undo path.
- Command: temporarily set the existing root `bunfig.toml` test coverage flag to false, ran `bun test packages/frontend/tests/selection-bridge.test.ts`, then restored the file byte-for-byte. Result: `1 pass, 0 fail, 3 expect() calls`.
- Frontend integration command: `bun run build:frontend` passed; Vite emitted the pre-existing >500 kB chunk warning only.
- Frontend typecheck command: `bun run --cwd packages/frontend typecheck` passed after moving the focused test outside the frontend `src` include.

## Runtime RED -> GREEN 2026-08-22T14:40Z — atomic temp and undo
- Real surface scenario: `agent-browser open http://127.0.0.1:5173/`; open `Prototype demo`; click `Select`; pointer click viewport `(420,275)` inside the iframe; click `Open in Tweaks`; fill `font-size` with `56`; press `Tab`; wait for save.
- Initial RED: after blur, the active tab became `.index.html.83716.1787409143756.tmp`, the canvas showed `Artifact preview`, and `Retry` appeared. Source cause confirmed in `file-patch.ts:156-177` atomic sibling temp plus `watchers.ts:35-53` watcher emission plus `ProjectView.tsx:545-559` opening every `file.changed` event.
- Regression RED test: `packages/backend/tests/watchers.test.ts` expected exported `shouldSkipPath` and received `undefined` using `bun test packages/backend/tests/watchers.test.ts` with the existing root coverage flag temporarily disabled and restored.
- Fix: `files.ts` now filters the atomic-write filename shape both during indexing and watcher emission; `watchers.ts` exports and uses the same predicate. The specific `undo-info` GET route was moved before the generic `/fs/*` route because Hono declaration order previously returned 404 for `/index.html/undo-info`.
- GREEN focused test: `bun test packages/backend/tests/watchers.test.ts` -> `1 pass, 0 fail, 5 expect() calls` (coverage flag restored immediately after).
- Real-surface GREEN: after browser reload refreshed launch authority, `fetch('/api/projects/01M0MY2AGG5CYRVCH/fs/index.html/undo-info')` returned status 200 with `{"data":{"can_undo":false,...}}`; after `Select -> Open in Tweaks -> font-size 52 -> Tab`, it returned status 200 with `can_undo:true`; clicking `Undo last save (Edit / Tweaks)` returned to stable `Prototype demo`, canvas headline, and `can_undo:false`.
- Captured browser artifact paths: agent-browser returned `/Users/MoonGwanghoon/.agent-browser/tmp/screenshots/screenshot-1787409496797.png`, `...9644518.png`, and `...9650953.png`; requested evidence directory captures were also issued under `.omo/ulw-loop/design-burnguard-inline-vibe-20260822/evidence/vertical-slice/`.
- Correction: the project id used in the live fetches is `01M0MY2AGG5CY485NQC9TZRVCH`.

## UX RED -> GREEN 2026-08-22T14:55Z — responsive and motion
- Narrow RED scenario: `agent-browser set viewport 390 844`; open the real project; evaluate `{innerWidth, bodyScrollWidth, document.documentElement.scrollWidth}`. Baseline was `innerWidth:390, bodyScrollWidth:723, scrollWidth:723`; the fixed ChatPane (360px) plus ModePanel (320px) overflowed the viewport.
- Responsive fix: ChatPane and ModePanel collapse to full-width stacked regions below 900px; ProjectView uses an overflow-hidden responsive column; ProjectTopBar and Export/Present controls compress on narrow screens.
- Narrow GREEN scenario with the same invocation returned `innerWidth:390, bodyScrollWidth:390, documentElementScrollWidth:390`; screenshot artifact `/Users/MoonGwanghoon/.agent-browser/tmp/screenshots/screenshot-1787409948164.png` and requested `.omo/.../evidence/ux/narrow-after.png`.
- Reduced-motion RED scenario: `agent-browser set media light reduced-motion`; evaluate `matchMedia('(prefers-reduced-motion: reduce)').matches` and a button's computed transition. Baseline was `reduced:true, transition:0.15s`.
- Reduced-motion GREEN: `index.css` adds a reduced-motion media rule; same evaluation returned `reduced:true, transition:1e-05s`; screenshot `/Users/MoonGwanghoon/.agent-browser/tmp/screenshots/screenshot-1787410017325.png`.
- Desktop GREEN: `agent-browser set viewport 1440 900`, reload project, evaluate widths -> `innerWidth:1440, bodyScrollWidth:1440, documentElementScrollWidth:1440`; screenshot `/Users/MoonGwanghoon/.agent-browser/tmp/screenshots/screenshot-1787410050430.png`.
- Keyboard smoke: `agent-browser press Tab` focused a real link with browser outline `auto`, `1px`; screenshot `/Users/MoonGwanghoon/.agent-browser/tmp/screenshots/screenshot-1787410057009.png`.
- Full backend suite: `bun test packages/backend/tests` ran 270 tests across 35 files but remains red on five pre-existing platform/path assumptions: `resolveWithin > resolves a contained existing path`, `resolveWithin > allows a not-yet-existing leaf below an existing root`, `pruneOldExports > removes succeeded jobs older than the retention window`, `pruneOldExports > dryRun reports the work but does not unlink or delete anything`, and the symlinked-project-root draw boundary case. These failures are outside the changed seams and were not weakened.
- Focused cross-surface suite: with the existing root coverage flag temporarily disabled then restored, `bun test packages/backend/tests/watchers.test.ts packages/backend/tests/file-patch.test.ts packages/frontend/tests/selection-bridge.test.ts` passed `24 tests, 0 fail, 51 expect() calls`.
- Workspace `bun run typecheck`, frontend typecheck, and frontend build pass; the build retains only the pre-existing >500 kB chunk warning. LSP diagnostics remain unavailable because the project daemon socket never became reachable.

## Research checkpoint 2026-08-22T15:00Z
- Architecture worker `st_01a029d3` recommended the existing path: `/projects/:id` -> iframe node selection -> one style/text patch -> refreshed iframe -> file undo, with no new store or route; cited `Canvas.tsx:65-126,221-338`, `SelectorOverlay.tsx`, `ProjectView.tsx:260-329`, and `routes/artifacts.ts:128-280`.
- Reference worker `st_01a029d4` returned pinned primary URLs for all eight named repositories; the full ledger and transfer/no-copy decisions are in `research-ledger.md`.
- Paid-products worker `st_01a029d5` verified first-party pricing/product URLs for Bolt, v0, Lovable, Replit, and Relume; the ledger adds first-party Claude/Figma/Webflow/Framer comparison routes and marks dynamic billing selectors for re-check.
- UX worker `st_01a029d6` was provider-rate-limited and remains inconclusive; lead-owned real-browser UX evidence above replaces that lane, not an approval.
