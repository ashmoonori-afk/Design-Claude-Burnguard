# Verification Economics

| claim | risk | error cost | verification cost/time | path | decision | outcome | residual risk |
|---|---|---|---|---|---|---|---|
| Claude Design feature inventory | medium | wrong roadmap priority | low | first-party pages plus second-source check | verify | verified 2026-08-13 (S003-S008; O-002/O-005/O-006 live recon) | beta 제품의 시점 스냅샷이므로 공식 페이지 변경 시 재확인이 필요하다 |
| Similar repository architecture | high | costly incompatible design | medium | pinned repository code plus independent review | verify | verified 2026-08-13 (S009-S015; O-007 pinned SHA 검토, 인용 URL 33건 전량 200 확인) | 실행하지 않은 export fidelity 주장은 여전히 미검증으로 남는다 |
| BurnGuard extension points | high | infeasible plan | medium | code map, tests, LSP/AST checks | verify | verified 2026-08-13 (O-008; packages/backend/src 직접 검사) | 부재로 확인된 보증은 구현 테스트 전까지 absence finding으로 유지된다 |

_Outcomes closed 2026-08-13 during the C001 audit; sources map to `sources-ledger.md` (S###) and `observation-manifest.md` (O-###)._
