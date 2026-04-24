<p align="right">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design는 로컬에 이미 설치된 `claude`, `codex` CLI를
채팅 + 캔버스 워크플로로 감싼 로컬 우선 AI 디자인 워크스페이스입니다.
프로젝트 파일을 SaaS로 옮기지 않고도 prototype과 slide deck을
생성, 수정, 리뷰, export하는 것이 목표입니다.

현재 릴리스: `0.4.0`

## Claude Design 대비 BurnGuard 차별점

Claude Design은 claude.ai에서 제공되는 호스티드 AI 디자인 경험이고,
BurnGuard는 로컬에 이미 설치된 `claude` / `codex` CLI를 감싸는
로컬 우선 워크스페이스입니다. 영역은 겹치지만, 로컬 하네스라는
구조 차이에서 실제 디자인 작업에 영향을 주는 분명한 차이점이
나옵니다.

- **파일이 머신 밖으로 나가지 않습니다.** 프로젝트, 디자인 시스템,
  SQLite 메타데이터, export, 로그 모두 `~/.burnguard/` 아래에
  저장됩니다. 사내 deck이나 브랜드 자산을 호스티드 테넌트에
  업로드할 일이 없습니다.
- **별도 API 키 관리가 없습니다.** 로컬 CLI의 로그인 상태를 그대로
  재사용합니다. `keyfile`도, secrets UI도, "API 키 붙여넣기" UX도
  없습니다 ([Key file / API key](#key-file--api-key) 참고).
- **백엔드 교체 가능.** 채팅 탭의 `cc | cx` 토글로 다음 idle 턴부터
  Claude Code ↔ Codex를 세션 단위로 전환할 수 있습니다. 동일한
  프로젝트가 두 CLI 모두에서 동작합니다.
- **프롬프트가 공개되어 있고 감사 가능.** 프롬프트 빌더
  (`packages/backend/src/harness/prompt-builder.ts`)는 결정적이며
  코드로 확인 가능합니다. 매 턴마다 CLI에 정확히 무엇이 전달되는지
  (프로젝트 타입 skill, 디자인 시스템 토큰, 오픈 코멘트, 첨부파일
  요약 포함) 직접 볼 수 있습니다.
- **턴 단위 롤백.** 모든 사용자 메시지는 턴 전 파일 스냅샷을
  남깁니다 (`services/checkpoints.ts`). 채팅 버블 hover 시 나타나는
  Revert로 프로젝트 트리를 정확히 그 시점으로 복원합니다.
- **디자인 시스템이 1급 시민.** GitHub repo, 라이브 홈페이지,
  PPTX, PDF로부터 DS를 canonical 폴더 (README / SKILL.md /
  `colors_and_type.css` / fonts / logos / 16개 preview / website
  UI kit / uploads)로 import하고, 이후 모든 턴이 그 토큰을
  참조합니다. Skill은 새 팔레트나 폰트 스택 도입을 명시적으로
  금지합니다.
- **여섯 개의 캔버스 모드.** 단순 프롬프트 박스가 아니라
  Select / Comment / Edit / Tweaks / Draw / Present가 1급 인터랙션
  모드로 동작합니다. Comment 핀은 다음 턴 프롬프트의
  `## Open comments` 섹션에 자동으로 첨부되어 CLI가 직접 다룹니다.
- **풍부한 export.** HTML zip, Playwright 기반 PDF, 슬라이드 단위
  편집 가능한 PPTX (스크린샷이 아니라 텍스트 박스), 그리고
  `source/` 트리 + `spec.json` 토큰 인덱스로 구성된 handoff 번들.
- **첨부파일 지능형 처리.** `.pptx` / `.pdf` 첨부는 compact manifest
  + `.extracted.md` 텍스트 sidecar를 함께 생성하고, 프롬프트가
  CLI를 sidecar 쪽으로 명시적으로 유도하면서 원본 바이너리에 대한
  `Read / Glob / Bash`는 금지합니다.
- **결정적 프로젝트 타입 skill.** Slide deck에는 12개 레이아웃
  아키타입 카탈로그 + 슬라이드별 엄격 콘텐츠 규약이, prototype에는
  13개 섹션 아키타입 + 프레임워크 없는 단일 파일 아티팩트 계약이
  매 턴 함께 주입됩니다.
- **턴 중간 인터럽트.** 한 턴이 임계값 (Settings → Interrupt button
  delay, 기본 5분) 이상 걸리면 빨간 Stop 버튼이 composer에 나타나
  `AbortController`로 child CLI를 SIGKILL로 깔끔하게 종료합니다.
- **Apache 2.0 오픈소스.** Fork, 감사, self-host, 확장 모두 가능.
  자세한 내용은 [LICENSE](LICENSE) 참고.

## 현재 상태

- 현재 단계: **Phase 3는 사실상 shipped, Phase 4는 적극 진행 중**
- 완료: Phase 1, Phase 2 A/B/C, Phase 3 A/B/C(리눅스 패키징 제외),
  **P4.1 디자인 시스템 자동 추출**, **P4.2 업로드 인제스트**
  (PDF / PPTX 디자인 시스템 업로드 + 채팅 첨부, Python 기반 compact
  manifest + 안전 텍스트 sidecar, 디자인 시스템 이름 변경 / 삭제 플로,
  업로드 크기 사전 가드)
- 최근 폴리싱: 설정 가능한 턴 중단 Interrupt 버튼 (Settings → Interrupt
  button delay), CLI 대기 중 Composer placeholder 회전 문구, slide deck /
  prototype 전용 skill 업그레이드 (레이아웃 / 섹션 아키타입 카탈로그 +
  슬라이드·섹션별 엄격 콘텐츠 규약)
- 남은 작업: **P3.11 Linux 빌드**, **P4.3 Figma sync**,
  브라우저 E2E 자동화, **P4.5 서명/노타리제이션**,
  **P5.1 Windows/macOS managed auto-update**
- 검증 상태: `bun test` 102/102 통과, `npm run typecheck` 통과

## 핵심 기능

### 홈과 워크스페이스

- **Recent / Mine / Examples / Systems** 네 개 탭
- 프로젝트 카드에 썸네일, 백엔드, 최근 활동 시간 표시
- Systems 탭에서 git URL / website URL / `.pptx` / `.pdf` 기반
  디자인 시스템 import 가능

### 프로젝트 생성

- `Prototype`, `Slide deck`, `From template`, `Other` 타입 지원
- Draft / Review / Published 상태의 디자인 시스템을 바로 선택 가능

### 채팅과 캔버스

- SSE 기반 이벤트 스트림
- Claude Code / Codex 세션별 전환
- user bubble 기준 rollback
- live canvas 렌더링
- `Select / Comment / Edit / Tweaks / Draw / Present` 모드 지원
- CLI 대기 중 composer placeholder 회전 (로컬 CLI 워밍업 시간 표시)
- 턴이 설정 임계값(기본 5분, Settings에서 변경) 이상 걸리면 Send
  버튼이 빨간 **Stop** 으로 전환되며 `/api/sessions/:id/interrupt`
  호출로 child CLI 프로세스를 SIGKILL로 정리

### Export

- `html_zip`
- `pdf`
- `pptx`
- `handoff`

PDF / PPTX export에는 Chromium이 필요하며 Settings에서 설치할 수 있습니다.

### Design System ingest

다음 소스를 canonical BurnGuard 디자인 시스템 구조로 변환합니다.

- git repository
- website URL
- `.pptx`
- `.pdf`

업로드된 PPT/PDF는 Python 기반 compact manifest 추출기를 거쳐
색상, 폰트, heading/body sample, 페이지/슬라이드 요약만 남기므로
리뷰와 프롬프트 주입 시 토큰 사용량을 줄일 수 있습니다.

### 첨부파일 기반 생성

채팅에 `.pptx` / `.pdf`를 첨부하면 compact summary가 생성되어
prototype이나 slide deck 생성 프롬프트에 직접 반영됩니다.
첨부마다 `.extracted.md` sidecar가 함께 기록되어 CLI가 원본 바이너리를
`Read`하지 않고 안전한 텍스트 발췌본만 읽도록 프롬프트가 유도합니다.
즉 레퍼런스 deck/doc를 붙여서 결과물 생성에 활용할 수 있습니다.

### 프로젝트 타입별 Skill (프롬프트 주입)

모든 CLI 턴 앞에 프로젝트 타입별 skill이 함께 주입돼, 캔버스 런타임·
편집/코멘트 모드·export가 모두 해석 가능한 아티팩트가 생성되도록
유도합니다. 두 skill 모두 **구조 규약만 담고** 색상/타이포는 디자인
시스템 토큰(`colors_and_type.css`)에서 그대로 흐르게 합니다.

- **Slide deck skill** — `<section data-slide data-layout="...">` 계약,
  12개 레이아웃 아키타입 카탈로그 (`cover`, `agenda`,
  `two-column-problem-solution`, `photo-list-split`, `big-number`,
  `vertical-timeline`, `three-step-columns`, `arrow-steps`,
  `quote-callout`, `logo-grid`, `chart`, `closing`), 슬라이드별 엄격
  콘텐츠 규약 (title ≤ 8 words, bullet 2–4개 / 각 ≤ 12 words, 슬라이드
  당 takeaway 1개), 기본 15-슬라이드 pitch 내러티브.
- **Prototype skill** — 단일 `index.html` 계약 (프레임워크·번들러
  금지), 13개 섹션 아키타입 (`hero-centered`, `hero-split`,
  `hero-video`, `feature-grid-3`, `feature-alternating`, `logo-strip`,
  `quote-hero`, `testimonial-grid`, `pricing-tiered`, `stats-row`,
  `faq-accordion`, `cta-banner`, `footer-minimal`), 섹션별 콘텐츠
  규약, 인터랙션 관습 (CSS 트랜지션 + 단일 `IntersectionObserver`
  scroll reveal).

## Claude Design 목표 대비 남은 작업

- Linux 패키징 / 배포 경로
- Figma REST sync
- 브라우저 E2E 자동화
- upstream CLI가 완전히 지원할 때의 true tool-decision round-trip
- Windows/macOS용 간편 설치 / 실행 패키지: Windows installer (`Setup.exe` / `.msi`), macOS package (`.dmg`, 이후 필요 시 `.pkg`) + first-run bootstrap (P4.6)
- Windows/macOS managed auto-update
- Windows SmartScreen / macOS notarization

## 로컬 실행

사전 준비:

- Bun
- Node.js
- `PATH`에 있는 CLI 중 하나 이상
  - `claude`
  - `codex`
- Python 3.10+  
  PDF / PPTX 기반 디자인 시스템 업로드에 필요합니다.
  의존성은 [packages/backend/requirements.txt](packages/backend/requirements.txt)에 있습니다.

설치 및 확인:

```powershell
bun install
cmd /c npm.cmd run typecheck
```

동시 실행:

```powershell
bun run dev
```

분리 실행:

```powershell
bun run dev:backend
bun run dev:frontend
```

빌드:

```powershell
bun run build
```

macOS 번들:

```powershell
bun run build:mac
bun run build:mac:dmg
```

## 설정과 데이터 위치

BurnGuard는 사용자 데이터를 아래에 저장합니다.

```text
~/.burnguard
```

일반적인 Windows 경로:

```text
C:\Users\<username>\.burnguard
```

주요 경로:

```text
~/.burnguard/
  config.json
  data/
    burnguard.sqlite
    projects/
    systems/
  cache/
  exports/
  logs/
```

## Key file / API key

BurnGuard는 자체 `keyfile`이나 API key 입력 UI를 사용하지 않습니다.
로컬 CLI의 로그인 상태를 그대로 재사용합니다.

- `claude`가 로그인돼 있으면 그 상태 사용
- `codex`가 준비돼 있으면 그 상태 사용

즉, BurnGuard가 직접 provider API key를 저장하지 않습니다.

## 문서

더 자세한 문서는 [doc/README.md](doc/README.md)를 참고하세요.

## 라이선스

BurnGuard Design는 [Apache License 2.0](LICENSE)으로 배포됩니다.
