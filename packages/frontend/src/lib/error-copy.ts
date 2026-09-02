/**
 * Korean 해요체 copy for backend `ApiError` codes, each paired with a
 * concrete next step. The backend's `message` field is an internal,
 * English string (see routes/*.ts `fail(code, message)` calls) — it is
 * never fit to show a user, so every caller that surfaces an API
 * failure should render `apiErrorCopy(error)` instead of `error.message`.
 */

const ERROR_COPY: Record<string, string> = {
  invalid_name: "이름을 확인해 주세요. 비어 있거나 너무 길면 저장할 수 없어요.",
  invalid_backend: "선택한 백엔드를 지원하지 않아요. 다른 백엔드를 골라 주세요.",
  invalid_project_options:
    "프로젝트 옵션이 프로젝트 종류와 맞지 않아요. 값을 다시 확인한 뒤 시도해 주세요.",
  forbidden: "이 요청을 처리할 권한이 없어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  has_active_projects:
    "이 디자인 시스템을 쓰는 프로젝트가 아직 있어요. 해당 프로젝트를 먼저 삭제한 뒤 다시 시도해 주세요.",
  is_template: "기본 제공 템플릿이라 삭제할 수 없어요.",
  network_error: "서버에 연결하지 못했어요. 로컬 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.",
  session_busy: "지금 다른 작업이 진행 중이에요. 끝난 뒤 다시 시도해 주세요.",
  project_not_found: "프로젝트를 찾을 수 없어요. 목록을 새로고침한 뒤 다시 확인해 주세요.",
  invalid_source_url:
    "가져올 수 없는 주소예요. 공개 HTTPS 주소인지 확인한 뒤 다시 시도해 주세요.",
  website_fetch_failed:
    "웹사이트를 불러오지 못했어요. 주소가 맞는지 확인한 뒤 다시 시도해 주세요.",
  figma_token_missing:
    "Figma 액세스 토큰이 없어요. 설정 → Figma 액세스에서 먼저 등록한 뒤 다시 시도해 주세요.",
  upload_extract_failed:
    "업로드한 파일을 분석하지 못했어요. 파일이 손상되지 않았는지 확인한 뒤 다시 시도해 주세요.",
  unsafe_source_content:
    "안전하지 않은 내용이 감지돼 가져올 수 없어요. 다른 원본으로 다시 시도해 주세요.",
  // Client-side guard in HomeView's import form (mirrors the disabled
  // upload button, kept for defense in depth) — not a backend code.
  upload_file_required: "업로드할 .pptx 또는 .pdf 파일을 선택해 주세요.",
};

const FALLBACK_COPY = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * Maps an unknown thrown value (typically `ApiError`, which carries a
 * string `code`) to its Korean copy. Anything without a known code —
 * including a plain `Error`, a non-`ApiError` throw, or an
 * unrecognized backend code — falls back to a generic Korean message
 * rather than ever showing the raw (usually English) error text.
 */
export function apiErrorCopy(error: unknown): string {
  const code = errorCode(error);
  if (code !== null && code in ERROR_COPY) {
    return ERROR_COPY[code];
  }
  return FALLBACK_COPY;
}

function errorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return null;
}
