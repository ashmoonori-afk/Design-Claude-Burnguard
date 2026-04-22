# BurnGuard Design

로컬에서 Claude Design 스타일의 워크플로우를 돌리기 위한 Windows용 앱입니다.  
`claude` 또는 `codex` 같은 **이미 설치된 로컬 CLI**를 감싸서, 채팅 -> 캔버스 -> 파일 -> export 흐름으로 프로토타입과 슬라이드 덱을 만들 수 있게 하는 것이 목표입니다.

## 한눈에 보기

- 대상: Windows 10/11
- 실행 방식: 로컬 웹앱 + 로컬 CLI 연동
- 현재 단계: **late Phase 1 / internal alpha**
- 지금 되는 것:
  - 프로젝트 생성
  - Claude Code / Codex 감지
  - 채팅 전송 + SSE 스트리밍
  - 첨부파일 업로드
  - 캔버스 렌더링
  - 파일 인덱싱 / refresh
  - `html_zip` export
  - `prototype`, `slide_deck` 시작 템플릿
- 아직 안 되는 것:
  - 실제 DOM 기반 selector inspection
  - 실행 중인 CLI turn의 진짜 interrupt
  - Codex의 구조화된 tool/file 이벤트
  - PDF / PPTX / handoff export
  - comment / edit / tweaks / draw 모드의 실사용 기능

## 이 프로젝트가 지향하는 것

Claude Design과 비교했을 때 BurnGuard Design의 목표는 아래와 같습니다.

- 클라우드 SaaS가 아니라 **로컬 실행**
- API 키를 BurnGuard에 직접 넣는 대신 **이미 로그인된 CLI 재사용**
- 생성 결과를 채팅과 캔버스에서 바로 확인
- 결과물을 프로젝트 파일로 남기고 export 가능
- 디자인 시스템을 로컬 파일 형태로 관리

즉, “Claude Design과 비슷한 UX를 로컬 도구 체인 위에 재구성”하는 프로젝트입니다.

## Claude Design 대비 현재 남은 작업

현재 구현 상태 기준으로, Claude Design에 가까워지기 위해 남은 큰 작업은 이렇습니다.

### 1. 인터랙션 품질

- selector overlay가 아직 placeholder입니다
- iframe 안 실제 element를 읽어서 오른쪽 패널에 보여주는 흐름이 아직 완성되지 않았습니다
- comment / edit / tweaks / draw 모드는 UI 자리만 있고 동작은 아직 없습니다

### 2. 실행 제어

- `interrupt` API는 있지만 실제 subprocess를 끊지는 못합니다
- Codex는 raw text 위주로만 연결되어 있고, Claude Code만큼 구조화된 이벤트를 주지 않습니다

### 3. export 완성도

- 지금은 `html_zip`만 실제 동작합니다
- `pdf`, `pptx`, `handoff`는 스키마와 UI는 있으나 구현은 아직입니다

### 4. 안정성 / 검증

- 자동화된 integration / E2E 테스트가 아직 없습니다
- adapter fixture 기반 회귀 검증도 더 필요합니다

## 지금 실제로 되는 사용자 플로우

현재 코드 기준으로는 아래 플로우가 가장 현실적인 사용 경로입니다.

1. 앱 실행
2. `claude` 또는 `codex` 감지
3. `prototype` 또는 `slide_deck` 프로젝트 생성
4. 기본 디자인 시스템 선택
5. 프롬프트 입력, 필요하면 파일 첨부
6. 채팅 스트림 확인
7. 캔버스에서 결과 확인
8. 파일 refresh / 자동 reload
9. `html_zip` export

## 실행 방법

### 개발 모드

사전 요구사항:

- Bun 설치
- Node.js 설치
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
bun run dev:backend
bun run dev:frontend
```

한 번에 실행:

```powershell
bun run dev
```

기본적으로 프론트엔드는 Vite 개발 서버에서 뜨고, 백엔드는 `127.0.0.1:14070`을 사용합니다.

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
  config.json          # 앱 설정
  data/
    projects/          # 프로젝트 파일
    systems/           # 디자인 시스템
  cache/
    exports/           # export 산출물
  logs/                # 로그
```

현재 코드 기준 기본 설정 파일:

```text
~/.burnguard/config.json
```

이 파일에는 예를 들어 아래 항목들이 들어갑니다.

- 기본 backend (`claude-code` / `codex`)
- 테마
- 포트
- auto open browser 여부
- 로그 레벨
- 사용자 표시 이름

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

- 만약 특정 CLI가 자체적으로 로그인, 토큰, 환경변수를 필요로 하면 그것은 **해당 CLI의 설정 방식**을 따라야 합니다
- BurnGuard README는 CLI 자체의 인증 과정을 대신하지 않습니다

## 현재 권장 사용 방식

지금 단계에서는 아래처럼 쓰는 것이 가장 안전합니다.

- 1순위 backend: Claude Code
- 사용 목적: prototype 또는 간단한 slide deck 초안
- export: `html_zip` 위주
- selector / comment / edit / tweaks는 아직 기대하지 않기
- Codex는 보조 backend 정도로 보기

## 검증 상태

수동 검증 기준:

- `cmd /c npm.cmd run typecheck`
- frontend build
- 전체 build
- health / project / session / files / artifacts / export API smoke

검증이 아직 부족한 부분:

- selector 실동작
- interrupt의 end-to-end 동작
- Codex 파서 정교화
- 자동 테스트

## 문서

상세 문서는 [`doc/`](./doc/README.md)에 정리되어 있습니다.

추천 순서:

1. [doc/00-overview.md](./doc/00-overview.md)
2. [doc/01-architecture.md](./doc/01-architecture.md)
3. [doc/03-backend-adapters.md](./doc/03-backend-adapters.md)
4. [doc/06-milestones.md](./doc/06-milestones.md)

## 저장소 구조

```text
BurnGuard/
  doc/                     제품/아키텍처 문서
  devplan/                 실행 계획 및 메모
  design system sample/    샘플 디자인 시스템
  packages/
    shared/                공용 타입
    backend/               Bun + Hono + SQLite + harness
    frontend/              React + Vite 앱
  scripts/                 빌드 스크립트
```

## 현재 한 줄 요약

BurnGuard Design은 **“로컬 CLI를 이용해 Claude Design 비슷한 생성형 디자인 워크플로우를 재현하는 Windows 앱”**이고, 지금은 **핵심 루프는 돌아가지만 인터랙션 완성도와 export 확장이 아직 남은 상태**입니다.
