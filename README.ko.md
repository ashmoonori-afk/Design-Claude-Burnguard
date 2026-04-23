<p align="right">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-004fff?style=for-the-badge" /></a>
</p>

# BurnGuard Design

BurnGuard Design은 이미 설치되어 있는 `claude`, `codex` CLI를 채팅 + 캔버스 워크플로로 감싸는 로컬 우선 AI 디자인 워크스페이스입니다. 프로젝트 파일을 SaaS로 옮기지 않고도 프로토타입과 슬라이드 덱을 생성, 수정, 리뷰, export할 수 있게 만드는 것이 목표입니다.

현재 릴리스: `0.3.1`

## 현재 단계

- 현재 상태: **Phase 3 대부분 완료**
- 완료: Phase 1, Phase 2 A/B/C, Phase 3 A/B, Phase 3 C 대부분
- 남은 큰 작업: **P3.11 Linux 빌드**
- 검증 상태: `bun test` 통과, `npm run typecheck` 통과

## 지금 되는 것

- `prototype`, `slide_deck`, `from_template`, `other` 프로젝트 생성
- 로컬 `claude`, `codex` CLI 감지 및 세션별 backend 전환
- 정규화된 chat/tool/file/status 이벤트 스트리밍
- 현재 결과물을 iframe 기반 캔버스에서 실시간 확인
- Comment, Edit, Tweaks, Draw, Present 모드
- interrupt, rollback, export 흐름
- `html_zip`, `pdf`, `pptx`, `handoff` export

## Claude Design 대비 남은 작업

- Linux 패키징과 배포 경로
- 브라우저 기반 E2E 자동화
- 업스트림 CLI가 완전한 스트리밍 decision round-trip을 지원할 때의 실연동
- 자동 업데이트, 코드 서명, 외부 디자인 파일 기반 디자인 시스템 추출

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
