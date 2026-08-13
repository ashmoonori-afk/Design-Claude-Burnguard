# BurnGuard implementation stages

This is the execution contract derived from
`.omo/ulw-research/20260813-113143/SYNTHESIS.md`.

## Delivery model

- `R0` is an independent verified research PR.
- Every product branch starts from `main`. `dependsOn` controls merge order;
  Git base ancestry is not used as a substitute for the dependency DAG.
- Multi-parent stages start only after every dependency PR is merged into
  `main`.
- A stage does not start implementation until its failing test reproduces the
  named regression.
- A stage completes only after focused tests, repository typecheck, the
  relevant production build, real-surface QA, documentation consistency, and a
  spaghetti-code review pass.
- Comparator code and assets are not copied. Any new dependency or bundled
  artifact must pass path-level provenance, NOTICE, license, and artifact-SBOM
  review.

## Selected stages and binary gates

| Stage | BG | Branch | Depends on | Binary acceptance gate |
|---|---|---|---|---|
| R0 | research | `research/design-competitive-synthesis` | none | Writing PASS; Chromium 390–1440 px PASS; source refs 1–43 unique; BG-01–23 exact |
| S1 | BG-01 | `feat/bg01-local-authority` | none | GET, SSE, and mutation work through packaged and Vite paths; hostile simple/preflight requests and absent/wrong/stale capabilities produce 401/403 with zero DB/file/process side effects |
| S2 | BG-02 | `fix/bg02-cli-contracts` | S1 | Probe detects current Codex `-p` misuse, prescribes `codex exec -`, and harmlessly exercises installed Claude 2.1.229/Codex 0.145.0; prompt/token/attachment/full-home sentinels are absent |
| S3 | BG-03 | `feat/bg03-workspace-trust` | S1 | Imported workspace cannot invoke CLI/install/fetch/active preview before explicit trust; trusted workspace keeps the same happy path |
| S4 | BG-04 | `fix/bg04-project-boundary` | S1 | Traversal, sibling-prefix, symlink/junction/reparse and root-identity fixtures fail closed with the external sentinel unchanged |
| S5 | BG-05 | `fix/bg05-import-budgets` | S3, S4 | Numeric budgets are fixed in evidence; every bomb fixture returns a typed rejection within them, the parent remains responsive, and child/temp cleanup receipts pass; unenforceable platform caps remain an explicit failed gate |
| S6 | BG-06 | `fix/bg06-offline-handoff` | S3, S4 | Script/img/font/CSS/fetch/XHR/beacon/WebSocket/redirect/iframe/meta-refresh/popup/service-worker fixtures send zero requests and finish with a loss manifest or typed failure inside the recorded timeout; clean-temp archive inspection excludes seeded secrets |
| S7 | BG-08 | `feat/bg08-provenance-corpus` | S2 | Seeded omissions, ambiguities, substitutions and parser warnings are reported; normal fixtures introduce no new false positives |
| S8 | BG-09 | `feat/bg09-turn-diff` | S4 | Project mutation lock rejects concurrent turn/restore/patch/import; add/modify/delete/binary states survive reload and restore removes the diff |
| S9 | BG-10 | `feat/bg10-portable-bundle` | S4, S6 | Clean-profile round trip restores artifact/design-system/session summary; hashes match, forbidden paths/secrets are absent, and generated-artifact license/SBOM gate passes |
| S10 | BG-11 | `feat/bg11-diagnostics` | S2 | Diagnostics preview exactly equals exported fields and prompt/token/attachment/content/full-home sentinels are absent |
| S11 | BG-13 | `feat/bg13-pptx-elements` | none; fixture corpus prerequisite | PowerPoint and LibreOffice open generated image/rectangle/line fixtures; bounds, crop/contain and z-order meet the recorded tolerances; unsupported elements emit a loss warning |
| S12 | BG-15 | `feat/bg15-spatial-manipulation` | node-ID integrity validator prerequisite | Eligible absolute node move/resize/align survives reload and one-step undo; flow-layout nodes fail closed; target identity, comments and selections remain stable |

## Conditional and deferred work

- BG-07 is a spike after S2. It becomes a product stage only if the cold-restart
  fixture proves stable native-session semantics.
- BG-12, BG-14, and BG-16 through BG-22 remain conditional/deferred/later.
  BG-23 stays outside the first plan.
- Git-backed checkpoints, automatic node-ID repair, provider expansion,
  marketplace, collaboration, and remote MCP are not selected.

## Required evidence schema

Each stage directory under `.omo/ulw-loop/evidence/stages/<stage>/` must contain:

1. `red.txt` — failing-first command and expected regression.
2. `green.txt` — focused tests and static/build command receipts.
3. `manual-qa.md` — happy path, hostile/bad-input path, adjacent regression.
4. `quality.md` — spaghetti-code and documentation consistency verdicts.
5. `delivery.json` — branch, base, dependency state, commit SHA, remote ref,
   green commands, QA artifact paths, PR head/base, and PR URL.

