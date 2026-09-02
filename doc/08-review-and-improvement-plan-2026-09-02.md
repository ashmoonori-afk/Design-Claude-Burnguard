# 전체 코드 리뷰 및 개선 설계 (2026-09-02)

기준 커밋: `origin/main` 558d5e5 (PR #12 병합 직후). 검토 범위는 `packages/backend`,
`packages/frontend`, `packages/shared`, `scripts/qa`, `doc/` 전체이며, 실제 앱을 격리된
홈 디렉터리에서 구동하여 화면을 캡처하고 점검하였다. 발견 사항 중 제품 흐름을 끊는
항목은 코드 경로를 직접 대조하여 사실 여부를 확인하였다.

## 1. 요약

BurnGuard의 핵심 루프(프롬프트 → 생성 → 캔버스 확인 → 편집·코멘트 → 내보내기)는
현재 `main`에서 다음 세 가지 이유로 끊겨 있다.

1. **아티팩트 식별자 계약 불일치.** 백엔드는 낙관적 동시성 제어를 위해 모든 변경
   요청에 `revision`/`digest`를 요구하지만 프론트엔드는 이를 보내지 않는다. 그 결과
   편집 저장, 스타일 적용, 코멘트 핀 생성, 그리기 저장, 턴 되돌리기가 모두 400으로
   실패하고, 프로젝트 삭제는 capability 헤더 누락으로 403이 된다.
2. **턴 종료 후 캔버스가 갱신되지 않는다.** 백엔드는 어댑터의 `file.changed` 이벤트를
   버리고 `artifact.operation` 이벤트만 발행하는데, 프론트엔드는 `file.changed`만
   처리한다. 감시자 경로의 `publishFileChangeFromWatcher`도 호출부가 없다.
3. **Windows에서 Chromium 기반 기능이 전부 멈춘다.** Bun 런타임에서 Playwright의
   파이프 전송이 연결되지 않아 `chromium.launch`가 무기한 대기한다. PDF·PNG·PPTX
   내보내기, 썸네일, 품질 점검이 모두 걸리며, 홈 화면을 한 번 열 때마다 Chromium
   프로세스 트리가 누적된다(격리 실행에서 6개 트리가 남는 것을 확인).

그 밖에 접근성(문서 언어 `en`, 토스트 미공지, 라벨 없는 입력), 한국어 카피 일관성,
Windows 테스트 이식성, 설정·디자인 시스템 화면의 로딩·오류 상태 부재가 반복적으로
지적되었다.

## 2. 직접 검증한 핵심 결함

| # | 결함 | 근거 (file:line) | 심각도 |
|---|---|---|---|
| C1 | 편집·스타일 PATCH가 식별자 4개 필드를 보내지 않아 400 | `frontend/src/views/ProjectView.tsx` patchFileMutation·tweaksMutation, `backend/src/routes/artifact-operations.ts:65` | 치명 |
| C2 | 코멘트 핀 생성이 `artifact_revision/digest` 없이 POST하여 400 | `ProjectView.tsx` createCommentMutation, `backend/src/routes/comments.ts:118` | 치명 |
| C3 | 그리기 저장이 `x-burnguard-revision`/`if-match` 헤더 없이 PUT하여 400 | `frontend/src/api/draws.ts`, `backend/src/routes/managed-files.ts:77` | 치명 |
| C4 | 턴 되돌리기: 요청 본문 없음 + 사전 스냅샷을 아무도 기록하지 않음 | `frontend/src/api/checkpoints.ts`, `backend/src/routes/session.ts:388`, `services/checkpoints.ts:31`(호출부 없음) | 치명 |
| C5 | 프로젝트 삭제가 capability 헤더 없는 raw fetch라 403 | `frontend/src/api/home.ts:50`, `backend/src/security/request-authority.ts` | 치명 |
| C6 | 턴 종료 후 캔버스·파일 탭 미갱신 | `backend/src/services/turns.ts:284`, `services/file-change-broker.ts`(호출부 없음), `ProjectView.tsx:733-750` | 치명 |
| C7 | Windows + Bun에서 `chromium.launch` 무기한 대기, 타임아웃 없음 | `backend/src/services/export-render-session.ts:43`, 재현: 20초 프로브 3종 모두 타임아웃, Node에서는 8초 내 성공 | 치명(Windows) |
| C8 | 백엔드 테스트가 Windows에서 실행 불가: `new URL(...).pathname` 경로, 심볼릭 링크 EPERM, 실제 `~/.burnguard` 기록 | `backend/tests/research-*.test.ts`, `tests/catalog.test.ts:306` | 높음 |

## 3. 개선 테마와 우선순위

| ID | 테마 | 우선순위 | 규모 | 이번 PR |
|---|---|---|---|---|
| T1 | 아티팩트 식별자 계약 복구 (C1~C5) | P0 | M | 포함 |
| T2 | 턴 완료 후 캔버스 갱신 + 턴 런타임 안정화 (C6, Windows 중단 시 자식 프로세스 잔존, 종료 시 턴 미중단, CLI 오류 무음) | P0 | M | 포함 |
| T3 | Chromium 실행 경로를 CDP 연결로 전환하고 타임아웃 부여 (C7) | P0 | M | 포함 |
| T4 | Windows 테스트 이식성과 테스트 격리 (C8) | P1 | S | 포함 |
| T5 | 홈 화면 UX: 탭 의미 구분, 템플릿 배지 오분류, 디자인 시스템 탭 상태, 사이드바 탭 넘침, 삭제 차단 사유 표시, 영어 오류 문구 | P1 | M | 포함(일부) |
| T6 | 프로젝트 화면 UX: 오류 카드 죽은 버튼, 권한 대화상자 Esc 오작동, 코멘트 탭 전환 시 초안 유실, 캔버스 플레이스홀더 깜빡임, 토스트 지속 시간·z-index | P1 | M | 포함(일부) |
| T7 | 접근성: `lang="ko"`, `word-break: keep-all`, 토스트 live region, 입력 라벨, 호버 전용 컨트롤의 포커스 노출, Tweaks 팝오버 배경 토큰 | P1 | S | 포함 |
| T8 | 디자인 시스템·설정 화면: 프로젝트에 DS가 없을 때 무한 로딩, 설정 모달 부분 실패 처리, Chromium 상태 재시작 시 초기화, 테마 선택 무효 | P1 | M | 후속 |
| T9 | 내보내기 품질: PPTX 글자 크기 배율, 실패 사유 보존, 설치 버전 고정, 핸드오프 이중 저장, 취소 UI | P2 | M | 후속 |
| T10 | 디자인 시스템 추출: 실제 웹사이트 거부 문제, SVG 검증 완화, 한글 파일명·슬러그, git 환경 변수 | P2 | L | 후속 |
| T11 | 프롬프트 하네스: 스테이지 디렉터리 경로, Lucide 참조 경로, 한국어 키워드 라우팅, 방향 팔레트와 DS 충돌 | P2 | M | 후속 |
| T12 | 데이터·성능: 시드가 사용자 편집을 덮어씀, 아티팩트 스냅샷 GC 부재, 기동 시 전체 해시, 카탈로그 목록 해시, 썸네일 동시성 | P2 | L | 후속 |
| T13 | 도달 불가 하위 시스템(research/learning) 정리와 문서 정합성 | P3 | L | 후속 |

## 4. 이번 PR의 상세 설계

### T1. 아티팩트 식별자 계약 복구

원칙: 백엔드 계약은 그대로 두고 프론트엔드가 계약을 따르게 한다. 식별자의 단일
출처는 `GET /api/projects/:id/artifacts`(`current_revision`, `current_digest`)이고,
파일 단위 식별자(`expected_file_hash`, `node_fingerprint`)는
`GET /api/projects/:id/fs/<path>?node_bg_id=<id>` 응답 헤더에서 읽는다.

- `frontend/src/lib/artifact-identity.ts` (신규): `readFileIdentity(projectId, relPath, nodeBgId)`가
  헤더 `X-Burnguard-Revision`, `X-Burnguard-Artifact-Digest`, `X-Burnguard-File-Hash`,
  `X-Burnguard-Node-Fingerprint`를 파싱한다. `isStaleIdentityError(error)`는 409/412 또는
  `stale_artifact_identity` 코드를 판정한다.
- `ProjectView.tsx`: patch·tweaks 뮤테이션을 `readFileIdentity` → 본문 병합 →
  `patchProjectFile` 순서로 통일한다. 스타일 undo 스택은 성공 콜백에서만 push한다.
  코멘트 생성은 `artifactsQuery.data`의 revision/digest를 함께 보낸다. stale 응답을
  받으면 artifacts 쿼리를 무효화하고 한국어 안내 토스트를 띄운다.
- `api/draws.ts`: `putProjectDraws(projectId, relPath, svg, identity)`로 확장하여
  `x-burnguard-revision`, `if-match`, `x-burnguard-viewport` 헤더를 보낸다.
- `api/checkpoints.ts`: 되돌리기 요청 본문에 `expected_revision`,
  `expected_artifact_digest`를 담고 응답 타입을 실제 응답에 맞춘다.
- `backend/src/services/turns.ts`: 턴 실행 직전에 `writePreTurnSnapshot(project.id, turnId)`를
  호출한다. 실패해도 턴을 막지 않고 세션 trace에 남긴다.
- `api/client.ts`: 204 응답을 `undefined`로 돌려주도록 하고, `deleteProject`는 `apiFetch`를
  사용한다.

테스트: `frontend/tests/artifact-identity.test.ts`(헤더 파싱, 누락 시 오류, stale 판정),
`frontend/tests/client.test.ts`에 204 케이스, 백엔드 `tests/checkpoints.test.ts` 또는
`session-routes.test.ts`에 "턴 실행 후 스냅샷이 존재한다" 케이스.

### T2. 턴 완료 후 캔버스 갱신과 턴 런타임 안정화

- `ProjectView.tsx` 스트림 핸들러가 `artifact.operation`(outcome `committed`)을
  `file.changed`와 같은 방식으로 처리한다: `changedPaths` 중 HTML은 탭으로 열되 현재
  활성 탭을 빼앗지 않고, 활성 파일이 포함되면 `refreshTick`을 올리며, files·artifacts
  쿼리를 무효화한다. 파일 탭 자동 활성화는 첫 아티팩트가 열릴 때만 한다.
- `backend/src/adapters/claude-code/runner.ts`, `adapters/codex/runner.ts`: 중단 신호를
  받으면 루트가 종료되기 전에 `closeOwnedProcessTree(proc.pid)`를 먼저 실행한다.
  Windows에서 `claude.cmd` 래퍼만 죽고 CLI가 계속 실행되는 문제를 막는다.
- `backend/src/index.ts`: 종료 시 `interruptAllUserTurns()`를 먼저 호출한다.
- `adapters/claude-code/parser.ts`: `result`가 `is_error`이면 `status.error`를 발행하여
  로그인 만료·한도 초과가 빈 응답으로 끝나지 않게 한다.
- `services/backends.ts`: CLI 버전 프로브에 5초 타임아웃을 두고 stdout/stderr를
  동시에 읽는다.

### T3. Chromium 실행: 무기한 대기 제거와 자원 상한 (이번 PR), 네이티브 CDP 클라이언트 (후속)

프로브 결과(2026-09-02, Windows 11, Bun 1.3.13, playwright-core 1.59.1):

| 방식 | 결과 |
|---|---|
| Bun에서 `chromium.launch()` (기본·chrome·msedge 채널) | Chromium 프로세스는 뜨지만 파이프 연결이 완료되지 않아 20초 이상 대기 |
| Bun에서 `--remote-debugging-port` 실행 후 `chromium.connectOverCDP(ws)` | DevTools 엔드포인트는 1.7초 만에 열리지만 Playwright 연결이 10초 타임아웃 |
| Bun 네이티브 `WebSocket`으로 같은 엔드포인트에 `Browser.getVersion` | 54ms 만에 응답 |
| Node에서 `chromium.launch({ channel: "chrome" })` | 8초 내 성공 |

즉 Windows에서 막히는 것은 Bun 위의 Playwright 전송 계층이며, 브라우저 자체나 CDP는
정상이다. 따라서 이번 PR에서는 다음만 바꾼다.

- `export-render-session.ts` `launchChromium`: 각 실행 시도에 20초 타임아웃을 두고,
  타임아웃 시 브라우저 프로세스를 정리한 뒤 `chromium_launch_timeout` 코드로 실패한다.
  사용자에게는 "이 환경에서는 Chromium 렌더링을 완료하지 못했어요. HTML ZIP 내보내기는
  가능해요"라는 한국어 안내가 가도록 `ExportMenu`의 오류 매핑을 추가한다.
- `project-thumbnails.ts`: in-flight 중복 제거와 동시 실행 상한(2)을 두어 홈 화면을
  열 때마다 Chromium 프로세스가 누적되지 않게 한다.
- `playwright-install.ts`: 설치 상태를 재시작 후에도 실행 파일 존재 여부로 판정한다.

후속(T3-b): Bun 네이티브 WebSocket 위에 최소 CDP 클라이언트(`Target`, `Page.navigate`,
`Page.captureScreenshot`, `Page.printToPDF`, `Runtime.evaluate`, `Emulation`, `Fetch` 차단)를
구현하여 렌더 세션이 Playwright `Page`에 의존하지 않게 한다. Node 의존 없이 Windows에서
내보내기·썸네일·품질 점검을 살리는 가장 짧은 경로이다.

테스트: `tests/export-render-session.test.ts`에 "실행이 지연되면 20초 안에
`chromium_launch_timeout`으로 실패하고 프로세스가 남지 않는다" 케이스,
`tests/project-thumbnails.test.ts`에 동시 요청 병합 케이스.

### T4. Windows 테스트 이식성

- `new URL(..., import.meta.url).pathname` → `fileURLToPath(new URL(...))` (research 4개 파일).
- 심볼릭 링크를 만드는 테스트는 EPERM이면 건너뛴다.
- `catalog.test.ts` 등 실제 `~/.burnguard`에 쓰는 테스트는 임시 홈으로 격리한다.
- macOS 전용 도구를 가정하는 QA 하네스 테스트는 플랫폼 조건으로 건너뛴다.

### T5. 홈 화면 UX

- `backend/src/db/home-project-list.ts`: `mine`은 예제를 제외하고, `recent`는 최근 12개로
  제한하여 두 탭의 의미를 구분한다.
- `frontend/src/components/home/mappers.ts`: 템플릿 배지는 디자인 시스템 카드에만 붙이고,
  템플릿에서 만든 프로젝트는 실제 유형으로 표시한다.
- `HomeView.tsx`: 디자인 시스템 탭에 로딩·오류·빈 상태를 추가하고, 삭제 차단 사유를
  `ApiError.code`로 판별하며, 백엔드 영어 오류 문구를 한국어 카피 맵(`lib/error-copy.ts`)으로
  바꾼다.
- `Sidebar.tsx`: 프로젝트 유형 탭이 360px 안에 모두 보이도록 줄바꿈을 허용한다.

### T6. 프로젝트 화면 UX

- `ErrorCard.tsx`: 동작 없는 '신고' 버튼을 제거하고 '다시 시도'를 마지막 사용자
  메시지 재전송에 연결한다.
- `PermissionDialog.tsx`: Esc·바깥 클릭으로 닫히지 않게 하여 실수로 턴이 중단되지 않게 한다.
- `ChatPane.tsx`: 채팅·코멘트 탭을 모두 마운트한 채 `hidden`으로 전환하여 초안을 보존한다.
- `Canvas.tsx`: 같은 파일을 새로 고칠 때 플레이스홀더로 비우지 않고 이전 문서를 유지한다.
- `uiStore.ts`·`BackendCrashToast.tsx`: 오류·경고 토스트는 자동으로 사라지지 않게 하고,
  토스트 z-index를 대화상자보다 위로 올린다.

### T7. 접근성과 한국어 타이포그래피

- `index.html`을 `lang="ko"`로 바꾸고 `index.css`에 `word-break: keep-all`을 전역 적용한다.
- 토스트 컨테이너에 `role="status" aria-live="polite"`, 오류 토스트에 `role="alert"`.
- Composer textarea와 홈 가져오기 폼 입력에 라벨을 연결한다.
- 호버 전용 컨트롤(카드 메뉴, 턴 되돌리기)에 `focus-within`/`focus-visible` 노출을 추가한다.
- `tailwind.config.ts`에 `popover` 색상을 등록하여 스타일 팝오버 배경을 복구한다.

## 5. 검증 계획

1. `bun run typecheck` 통과.
2. 프론트엔드 `bun test` 전부 통과, 백엔드는 변경 파일 관련 테스트와 Windows 이식성
   테스트 통과.
3. E2E(Node + Playwright, Chrome 채널): 격리된 홈으로 백엔드를 띄운 뒤 예제 프로젝트를
   열어 편집 저장, 코멘트 핀 생성, 그리기 저장, 프로젝트 삭제, 홈 탭 전환을 실제 화면에서
   확인한다. 실행 스크립트는 `scripts/qa/e2e-smoke.mjs`로 저장소에 포함한다.

## 6. 후속 백로그 (이번 PR 제외)

T8~T13의 세부 항목은 리뷰 보고서(`doc/09-review-findings-2026-09-02.md`)의 발견 사항
참조 번호와 함께 관리한다. 특히 T10(웹사이트 가져오기 거부)과 T12(스냅샷 GC 부재)는
사용자 체감이 크므로 다음 반복의 P1로 올린다.
