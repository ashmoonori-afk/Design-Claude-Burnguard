<p align="right">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design은 이미 설치되어 있는 `claude`, `codex` CLI를 채팅 + 캔버스 워크플로로 감싸는 로컬 우선 AI 디자인 워크스페이스입니다. 프로젝트 파일을 SaaS로 옮기지 않고도 프로토타입과 슬라이드 덱을 생성, 수정, 리뷰, export할 수 있게 만드는 것이 목표입니다.

현재 릴리스: `0.3.1`

## 현재 단계

- 현재 상태: **Phase 3 대부분 완료, Phase 4 착수**
- 완료: Phase 1, Phase 2 A/B/C, Phase 3 A/B, Phase 3 C 대부분, 그리고 **P4.1 디자인 시스템 자동 추출**
- 남은 큰 작업: **P3.11 Linux 빌드**, Phase 4 잔여 (파일 업로드 추출, Figma 싱크, 자동 업데이트, 서명)
- 검증 상태: `bun test` 67/67 통과, `npm run typecheck` 통과 (backend + frontend)

## 기능 둘러보기

> 스크린샷은 순차적으로 채워지고 있습니다. 아래 각 슬롯은
> `doc/screenshots/` 아래 경로를 예약해 두었습니다 — 파일명·크기 규약은
> `doc/screenshots/README.md`를 참고하세요. 지정된 경로에 PNG만 넣어두면
> 다음 렌더 때 `<img>` 태그가 자동으로 반영합니다.

### 홈 & 워크스페이스

<p align="center">
  <img src="doc/screenshots/home.png" alt="Recent / Mine / Examples / Systems 탭이 보이는 홈 화면" width="720">
</p>

네 개의 탭: **Recent** (최근 열어본 프로젝트), **Mine** (내가 만든 프로젝트),
**Examples** (자동 시드된 튜토리얼), **Systems** (자동 추출 import 폼
포함한 디자인 시스템 탭). 프로젝트 카드는 썸네일, 백엔드 표시, 마지막
활동 시각, 삭제 버튼을 함께 보여줍니다.

### 새 프로젝트 사이드바

<p align="center">
  <img src="doc/screenshots/new-project.png" alt="Prototype / Slide deck / From template / Other 탭 + 디자인 시스템 드롭다운을 가진 사이드바" width="360">
</p>

`Prototype` / `Slide deck` / `From template` / `Other` 타입 전환.
디자인 시스템 드롭다운은 상태와 상관없이 모든 DS (Draft / Review /
Published, 최근 활동 순)를 보여주므로 방금 import한 시스템도 상태
접미사(`(Draft)` 등)와 함께 즉시 선택 가능합니다.

### 채팅 패널

<p align="center">
  <img src="doc/screenshots/chat.png" alt="cc|cx 백엔드 토글과 사용자 말풍선에 Revert 버튼이 보이는 채팅 패널" width="720">
</p>

정규화된 이벤트 스트림: 사용자 메시지, 청크 단위 chat delta, 툴 시작
/ 종료, 파일 변경, usage delta, 세션 상태. 탭 헤더 오른쪽의 `cc | cx`
토글은 idle 상태인 다음 턴부터 Claude Code ↔ Codex 전환. 사용자
말풍선 호버 시 나타나는 **Revert** 버튼은 턴 직전 스냅샷으로 복원
(`services/checkpoints.ts`). `tool.permission_required` 이벤트가 발생하면
권한 다이얼로그가 자동으로 뜹니다.

### 캔버스 & 인터랙션 모드

<p align="center">
  <img src="doc/screenshots/canvas.png" alt="모드 토글 바와 우측 인스펙터가 있는 캔버스 iframe" width="720">
</p>

현재 프로젝트 결과물의 라이브 iframe. 동시에 하나만 활성화되는 다섯 모드:

- **Select** — 요소 위에 호버하면 하이라이트, 클릭하면 실제
  `font-family / font-size / color / padding / ...`이 우측 패널에 표시됩니다.
- **Comment** — 클릭 위치에 핀을 남기고 슬라이드 인덱스 + 정규화된
  퍼센트 좌표로 저장합니다. 미해결 핀은 다음 CLI 프롬프트의
  `## Open comments`에 자동 주입됩니다.
- **Edit** — `[data-bg-node-id]` 요소를 호버로 선택하고 텍스트/속성을
  인스펙터에서 편집, Save 시 디스크의 HTML을 PATCH하면 iframe이
  자동 리로드됩니다.
- **Tweaks** — 구조화된 CSS 컨트롤 (P3.12에서 shipped):
  <p align="center">
    <img src="doc/screenshots/canvas-tweaks.png" alt="px 단위 숫자 입력, 브랜드 팔레트 색 선택, 4방향 padding 컴포저를 가진 Tweaks 인스펙터" width="540">
  </p>
  `font-size / line-height / letter-spacing`는 숫자 + `px` 고정 입력,
  `color / background-color`는 브랜드 팔레트 피커 (+ hex 입력) 팝오버,
  `padding / margin / border-radius`는 4방향 입력 → 커밋 시 가장 짧은
  CSS shorthand로 재조합, `font-weight`는 드롭다운.
- **Draw** — pen / rect / arrow 툴과 5색 스와치를 가진 SVG 오버레이.
  `.meta/draws/<file>.svg`에 영속되고 Cmd/Ctrl+Z 로 undo / redo.

활성 탭이 슬라이드 덱이면 **Present** 버튼이 활성화되어 풀스크린
재생 모드로 전환. 방향키 / 스페이스 네비게이션과 스피커 노트
(`?present=1` → `body[data-presenter]`)를 지원합니다.

### 디자인 시스템

<p align="center">
  <img src="doc/screenshots/design-system.png" alt="Validation 카드와 Brand / Color / Typography / Components 16장 프리뷰 카드를 포함한 디자인 시스템 상세 화면" width="720">
</p>

각 DS는 16장의 프리뷰 카드를 포함합니다: Brand (logos / icons), Colors
(brand / neutrals / ramps / semantic / charts), Typography (display /
headings / body), Foundations (spacing, radii + shadows), Components
(buttons / cards / forms / badges + table). 상세 화면 상단의 검증
카드는 추출 caveat (누락 토큰, 대체 폰트, 로고 개수 등)를 표시합니다.

### 디자인 시스템 자동 추출 (P4.1)

<p align="center">
  <img src="doc/screenshots/ds-import.png" alt="Source URL / 타입 선택 / 선택적 이름을 입력하는 Home / Systems 탭 import 폼" width="540">
</p>

`POST /api/design-systems/extract`는 얕은 git clone 또는 실 홈페이지
HTML + 같은 출처 CSS fetch 후 CSS 커스텀 프로퍼티, 폰트 패밀리, 로고
후보 asset을 파싱하여 `~/.burnguard/data/systems/<id>/` 아래에
BurnGuard 표준 구조(README.md / SKILL.md / `colors_and_type.css` /
`fonts/` / `assets/logos/` / `preview/*.html` × 16 / `ui_kits/website/`
/ `uploads/`)를 스캐폴딩합니다. 생성된 row는 Draft 상태로 시작하므로
검토 후 Published로 승격할 수 있습니다.

### Export

<p align="center">
  <img src="doc/screenshots/export-menu.png" alt="html_zip / pdf / pptx / handoff 옵션이 있는 Export 드롭다운" width="320">
</p>

네 가지 포맷:

- **`html_zip`** — 프로젝트 트리의 자체 완결 오프라인 스냅샷.
- **`pdf`** — Playwright 기반 덱 렌더링, 네비 바 아티팩트 없이 슬라이드당
  한 페이지.
- **`pptx`** — `pptxgenjs`로 슬라이드별 **편집 가능한 텍스트 박스**
  (플랫화된 스크린샷 아님). 볼드 / 이탤릭 / 정렬 / 폰트 패밀리 유지.
- **`handoff`** — 개발자 번들 (`source/` 트리 + `spec.json` 토큰 인덱스
  + `tokens/` CSS + README).

PDF와 PPTX는 Chromium이 필요합니다. Settings에서 한 번의 클릭으로 설치
가능 (`npx playwright install chromium` 래핑).

### 설정 & 백엔드 전환

<p align="center">
  <img src="doc/screenshots/settings.png" alt="Chromium 설치 상태, 로그 tail, 기본 백엔드 설정을 가진 Settings 모달" width="640">
</p>

- 실시간 Chromium 설치 상태(회색 / 앰버 펄스 / 녹색) + 재설치 버튼 + 폴링
  되는 12줄 설치 로그 tail.
- 세션별 백엔드 토글이 채팅 패널에도 노출되며 `/api/sessions/:id/backend`
  PATCH로 다음 idle 턴부터 새 CLI를 사용합니다.

## Claude Design 대비 남은 작업

- Linux 패키징과 배포 경로 (P3.11)
- 파일 업로드 (PDF / PPTX / Figma export) 기반 DS 추출 + Figma REST 싱크 (P4.2 / P4.3)
- 브라우저 기반 E2E 자동화
- 업스트림 CLI가 완전한 스트리밍 decision round-trip을 지원할 때의 실연동
- 자동 업데이트 채널, Windows SmartScreen / macOS notarization 서명 (P4.4 / P4.5)

## 실행 방법

사전 준비:

- Bun 설치
- Node.js 설치
- 아래 CLI 중 하나 이상이 `PATH`에 있어야 함
  - `claude`
  - `codex`

설치와 확인:

```powershell
bun install
cmd /c npm.cmd run typecheck
```

한 번에 실행:

```powershell
bun run dev
```

각각 실행:

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

## Export 메모

- `html_zip`: 프로젝트 스냅샷
- `pdf`: Playwright 기반 덱 export
- `pptx`: 편집 가능한 텍스트 박스 중심 덱 export
- `handoff`: 프로젝트 파일 + `spec.json` 개발자 번들

Playwright 기반 export에 Chromium이 없으면 Settings에서 설치하거나 아래 명령을 실행하면 됩니다.

```powershell
npx playwright install chromium
```

## 설정 파일과 데이터 위치

BurnGuard 사용자 데이터는 아래에 저장됩니다.

```text
~/.burnguard
```

Windows 기준 보통은 아래 경로입니다.

```text
C:\Users\<username>\.burnguard
```

주요 파일:

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

## Key file / API 키

BurnGuard 자체는 `keyfile`, `secrets.json`, 내장 API 키 입력 UI를 사용하지 않습니다.

대신 이미 설치한 로컬 CLI의 인증 상태를 그대로 재사용합니다.

- `claude` CLI가 설치되어 있고 로그인되어 있으면 그 상태를 사용
- `codex` CLI가 준비되어 있으면 그 상태를 사용

즉:

- BurnGuard가 직접 API 키를 저장하지 않음
- 인증은 BurnGuard가 아니라 각 CLI가 관리함

## 처음 쓸 때 권장 흐름

1. 앱 실행
2. 자동 생성된 튜토리얼 프로젝트 열기
3. `slide_deck` 프로젝트에 프롬프트 보내기
4. 캔버스에서 결과 확인
5. Comment 또는 Edit/Tweaks 모드 사용
6. `html_zip`, `pdf`, `pptx` 중 하나로 export

## 문서

자세한 문서는 [doc/README.md](doc/README.md)에 정리되어 있습니다.

## 라이선스

BurnGuard Design은 [Apache License 2.0](LICENSE)으로 배포됩니다.
저작권 고지와 변경 사항 명시, 라이선스 전문 포함 조건을 지키는 한
상업적 이용과 개인 이용, 수정과 재배포가 자유롭습니다. 소프트웨어는
**"있는 그대로"(as is)** 제공되며 별도의 보증은 없으니 전체 조건은
LICENSE 파일의 원문을 참고하세요.
