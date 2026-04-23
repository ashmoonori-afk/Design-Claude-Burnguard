<p align="right">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design는 로컬에 이미 설치된 `claude`, `codex` CLI를
채팅 + 캔버스 워크플로로 감싼 로컬 우선 AI 디자인 워크스페이스입니다.
프로젝트 파일을 SaaS로 옮기지 않고도 prototype과 slide deck을
생성, 수정, 리뷰, export하는 것이 목표입니다.

현재 릴리스: `0.4.0`

## 현재 상태

- 현재 단계: **Phase 3는 사실상 shipped, Phase 4는 적극 진행 중**
- 완료: Phase 1, Phase 2 A/B/C, Phase 3 A/B/C(리눅스 패키징 제외),
  그리고 **P4.1 디자인 시스템 자동 추출** + **P4.2 업로드 추출의 1차 경로**
- 남은 작업: **P3.11 Linux 빌드**, **P4.3 Figma sync**,
  브라우저 E2E 자동화, **P4.5 서명/노타리제이션**,
  **P5.1 Windows/macOS managed auto-update**
- 검증 상태: `bun test` 101/101 통과, `npm run typecheck` 통과

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
즉 레퍼런스 deck/doc를 붙여서 결과물 생성에 활용할 수 있습니다.

## Claude Design 목표 대비 남은 작업

- Linux 패키징 / 배포 경로
- Figma REST sync
- 브라우저 E2E 자동화
- upstream CLI가 완전히 지원할 때의 true tool-decision round-trip
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
