# BurnGuard Design

로컬에서 Claude Design 스타일의 워크플로우를 돌리기 위한 Windows용 앱입니다.
`claude` 또는 `codex` 같은 **이미 설치된 로컬 CLI**를 감싸서, 채팅 → 캔버스 → 파일
→ export 흐름으로 프로토타입과 슬라이드 덱을 만들 수 있게 하는 것이 목표입니다.

## 한눈에 보기

- 대상: Windows 10/11 (Bun 기반 백엔드, React + Vite 프론트)
- 실행 방식: 로컬 웹앱 + 로컬 CLI 연동
- 현재 단계: **Phase 2 코드 완결 / 매뉴얼 스모크 테스트 대기**
  - Phase 1 sign-off 항목 1–4 코드 완료, 5번(Windows 스모크 테스트)만 남음
  - Phase 2 Milestone A (슬라이드 덱 기반) + B (Comment / Edit / Permission gate) + C
    (PDF / PPTX / Settings / Tutorial) 모두 merge
  - `bun test` 23/23 green; chromium 의존 셀은 `BG_EXPORT_SMOKE=1`로 opt-in
- 현재 체크리스트: [`doc/07-manual-smoke-test.md`](./doc/07-manual-smoke-test.md)

## 지금 되는 것

- 프로젝트 생성 (`prototype`, `slide_deck`) + 튜토리얼 2개 자동 seed
- Claude Code / Codex 감지 + 세션 단위 backend 스위치 (next turn에 반영)
- 채팅 전송 + SSE 스트리밍 + 긴 턴 실시간 interrupt (subprocess 실제 kill)
- 첨부파일 업로드
- 슬라이드 덱 runtime (키보드 / 스와이프 / hover 네비게이션)
- 캔버스 렌더링 + iframe 기반 실제 DOM selector + computed style 패널
- Comment 모드 — 핀 드롭 / 노트 / resolve / 슬라이드별 스코프 / 미해결은 다음 턴
  프롬프트에 자동 포함
- Edit 모드 — `[data-bg-node-id]` 요소 호버 → 클릭 → 텍스트 / 속성 편집 → 단일
  노드 PATCH (다른 DOM 보존)
- Permission gate UI — `tool.permission_required` 수신 시 Radix Dialog; Deny 시 turn
  정상 중단
- Export
  - `html_zip` — 오프라인 렌더 그대로
  - `pdf` — Playwright 헤드리스 + A4 landscape (deck only)
  - `pptx` — pptxgenjs로 편집 가능한 텍스트 박스 (deck only)
- Settings 패널 — 기본 backend, display name, **"Install Chromium"** 버튼 (npx 실행
  + 라이브 로그 tail)
- 파일 인덱싱 / watcher 기반 auto reload

## 아직 없는 것

- `handoff` export (Phase 3)
- `tweaks` / `draw` 모드 실 동작 (Phase 3)
- Codex 구조화된 tool / file 이벤트 파싱 (Phase 1은 raw-mode로 ship 확정, 후속
  작업으로 유보)
- Playwright 기반 E2E UI 테스트 (백엔드 유닛 / export 스모크는 있음)
- macOS / Linux 빌드 (Phase 3)
- 자동 업데이트, SmartScreen 서명 (Phase 4)

## 설계 의도

Claude Design과 비교했을 때 BurnGuard Design의 목표는 아래와 같습니다.

- 클라우드 SaaS가 아니라 **로컬 실행**
- API 키를 BurnGuard에 직접 넣는 대신 **이미 로그인된 CLI 재사용**
- 생성 결과를 채팅과 캔버스에서 바로 확인
- 결과물을 프로젝트 파일로 남기고 편집 / export 가능
- 디자인 시스템을 로컬 파일 형태로 관리

즉, "Claude Design과 비슷한 UX를 로컬 도구 체인 위에 재구성"하는 프로젝트입니다.

## 지금 권장되는 사용 플로우

1. 앱 실행 (자동으로 `claude` / `codex` 감지)
2. 첫 실행에서 자동 생성된 두 튜토리얼 중 하나 열기
   - `[burnguard:tutorial] Prototype demo`
   - `[burnguard:tutorial] Slide deck demo`
3. `slide_deck`로 새 프로젝트를 만들고 프롬프트 입력
4. 캔버스에서 결과 확인, 필요한 부분에 Comment 드롭
5. Edit 모드로 제목 / 바디 텍스트 직접 수정
6. Export
   - 빠른 공유: `html_zip`
   - PDF 배포: `pdf` (Settings에서 Chromium 한 번 설치 필요)
   - PowerPoint 편집: `pptx`
7. 긴 턴이 잘못 돌아가면 interrupt 버튼으로 즉시 중단

## 실행 방법

### 개발 모드

사전 요구사항:

- Bun 설치
- Node.js 설치 (`npx playwright install chromium`용)
- 아래 둘 중 하나 이상이 `PATH`에 있어야 함
  - `claude`
  - `codex`

설치:

```powershell
bun install
cmd /c npm.cmd run typecheck
```

백엔드와 프론트엔드를 따로 실행:

```powershell
bun run dev:backend    # BG_DEV=1 자동 주입 → dev-only synth permission hook 활성
bun run dev:frontend
```

한 번에 실행:

```powershell
bun run dev
```

기본적으로 프론트엔드는 Vite 개발 서버에서 뜨고, 백엔드는
`127.0.0.1:14070`을 사용합니다.

### 테스트

```powershell
cd packages/backend
bun test                         # 23/23 기본 스위트
BG_EXPORT_SMOKE=1 bun test       # PDF/PPTX 렌더 스모크 포함 (Chromium 필요)
```

### 빌드

프론트 빌드:

```powershell
bun run build:frontend
```

Windows 실행 파일 빌드:

```powershell
bun run build:backend
```

전체 빌드:

```powershell
bun run build
```

생성 결과:

```text
dist/burnguard-design.exe
```

## 설정 파일 / 데이터 위치

앱 데이터는 사용자 홈 아래 `~/.burnguard`에 저장됩니다.
Windows 기준으로는 보통 아래 경로입니다.

```text
C:\Users\<username>\.burnguard
```

주요 파일:

```text
~/.burnguard/
  config.json          # 앱 설정 (기본 backend, 테마, 포트, auto-open, 표시 이름)
  data/
    burnguard.sqlite   # 프로젝트 / 세션 / 이벤트 / 코멘트
    projects/          # 프로젝트 파일
    systems/           # 디자인 시스템
  cache/
    exports/           # html_zip / pdf / pptx 산출물
  logs/                # 로그
```

## Key file / API 키 관련

### BurnGuard 자체 key file은 없습니다

BurnGuard는 별도의 `keyfile`, `secrets.json`, API key 입력 UI를 요구하지 않습니다.

대신 아래 방식을 씁니다.

- `claude` CLI가 이미 설치되어 있고 로그인되어 있으면 그것을 사용
- `codex` CLI가 이미 설치되어 있고 사용할 수 있으면 그것을 사용

즉:

- **BurnGuard에 키를 넣는 구조가 아님**
- **CLI 쪽 인증 상태를 그대로 재사용**

주의:

- 만약 특정 CLI가 자체적으로 로그인, 토큰, 환경변수를 필요로 하면 그것은 **해당
  CLI의 설정 방식**을 따라야 합니다
- BurnGuard README는 CLI 자체의 인증 과정을 대신하지 않습니다

## 검증 상태

### 자동

- `bun test` 23/23 pass — `prompt-builder`, `file-patch`, `export-pdf` CSS,
  `export-pptx` writer, 튜토리얼 HTML sanity
- `BG_EXPORT_SMOKE=1 bun test` — 실제 Chromium으로 deck → PDF / PPTX 렌더까지
- 3개 패키지(`@bg/shared`, `@bg/backend`, `@bg/frontend`) `tsc --noEmit` green

### 수동 (Phase 1 / M2.B / M2.C 종결 블로커)

[`doc/07-manual-smoke-test.md`](./doc/07-manual-smoke-test.md)에 20+ 체크 항목:

- Phase 1 루프: create → turn → selector → interrupt → html_zip → Codex raw-mode
- Milestone 2.B: Comment 슬라이드 스코프 / Edit disk 반영 / Permission gate
  synthesize 플로우
- Milestone 2.C: PDF 페이지 매트릭스 / PPTX 편집 가능 텍스트 / Chromium 설치
  플로우 / Backend 세션 스위치 / Tutorial seed + 2×3 export matrix

## 문서

상세 문서는 [`doc/`](./doc/README.md)에 정리되어 있습니다.

추천 순서:

1. [doc/00-overview.md](./doc/00-overview.md)
2. [doc/01-architecture.md](./doc/01-architecture.md)
3. [doc/03-backend-adapters.md](./doc/03-backend-adapters.md)
4. [doc/06-milestones.md](./doc/06-milestones.md) — 현재 슬라이스별 완료 상태
5. [doc/07-manual-smoke-test.md](./doc/07-manual-smoke-test.md) — 키보드로 돌리는
   체크리스트

## 저장소 구조

```text
BurnGuard/
  doc/                     제품 / 아키텍처 / 마일스톤 / 스모크 테스트 문서
  devplan/                 실행 계획 및 메모
  design system sample/    샘플 디자인 시스템 (Goldman-Sachs 스타일)
  packages/
    shared/                @bg/shared — 공용 타입 (events, artifacts, exports…)
    backend/               @bg/backend — Bun + Hono + SQLite + CLI harness
    frontend/              @bg/frontend — React + Vite 앱
  scripts/                 빌드 스크립트
```

## 현재 한 줄 요약

BurnGuard Design은 **로컬 CLI를 이용해 Claude Design 비슷한 생성형 디자인
워크플로우를 재현하는 Windows 앱**이고, 현재는 **Phase 2 전체 슬라이스가 code-
complete 상태이며 매뉴얼 스모크 테스트 통과만이 Phase 1 / M2.B / M2.C 공식
종료를 가로막고 있음**.
