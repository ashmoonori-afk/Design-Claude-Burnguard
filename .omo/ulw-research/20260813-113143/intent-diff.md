# Intent vs Reality

| intent_id | expected truth | observed reality | diff | violated invariant | intent source | observations | status | claims |
|---|---|---|---|---|---|---|---|---|
| I-01 | Local-first and existing CLI reuse remain product boundaries. | Workspace/system of record is local, but selected CLIs may transmit context under provider policy. | Zero-egress wording was too broad. | Do not promise offline/zero-egress. | README.md | O-001 | qualified | C-001 |
| I-02 | Visual iteration, not chat alone, is central to the target experience. | Official Claude Design separates chat, comments and direct edits and preserves directions. | Confirmed, but BurnGuard should not copy cloud collaboration. | Keep local single-user boundary. | Claude official sources | O-002 | verified | C-002 |
| I-03 | Candidate features are translated into BurnGuard-owned designs. | Pinned repositories converged on patterns; marketplace/provider breadth and unverified fidelity were rejected. | Features became independent BG tasks with gates. | No copied implementation or parity claims. | user request; pinned repositories | O-003 | verified | C-006..C-010 |
| I-04 | The plan is executable against current code boundaries. | Security, CLI, checkpoint, extractor, exporter and UI seams are mapped; existing milestones require reconciliation. | Initial three-ID roadmap was not executable and was normalized. | One BG ID space, dependencies, milestone disposition. | repository and reviews | O-004 | verified after correction | C-003..C-010 |

