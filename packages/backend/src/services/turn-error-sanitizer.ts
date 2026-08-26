import type { NormalizedEvent, TurnErrorCode } from "@bg/shared";
import { PathBoundaryError } from "../security/path-boundary";

const COPY: Readonly<Record<TurnErrorCode, string>> = {
  backend_unavailable: "선택한 작업 도구를 사용할 수 없어요. 설치 상태를 확인해 주세요.",
  path_unavailable: "프로젝트 파일에 안전하게 접근할 수 없어요. 다시 시도해 주세요.",
  immutable_reference_mutated: "읽기 전용 참조 파일이 변경되어 작업을 중단했어요.",
  immutable_reference_path_unavailable: "읽기 전용 참조 파일에 안전하게 접근할 수 없어 작업을 중단했어요.",
  immutable_reference_escaped: "읽기 전용 참조 파일은 결과물에 복사할 수 없어요.",
  private_input_unavailable: "첨부 파일을 안전하게 준비하지 못했어요. 다시 시도해 주세요.",
  publication_failed: "결과물을 안전하게 저장하지 못했어요. 다시 시도해 주세요.",
  operation_conflict: "다른 작업이 진행 중이에요. 잠시 후 다시 시도해 주세요.",
  operation_cancelled: "작업이 취소되었어요.",
  turn_failed: "요청을 처리하지 못했어요. 다시 시도해 주세요.",
};

export function sanitizeTurnEvent(event: NormalizedEvent, cause?: unknown): NormalizedEvent {
  if (event.type !== "status.error") return event;
  const code = turnErrorCode(cause, event.code ?? event.message);
  return { ...event, code, message: COPY[code] };
}

export function turnErrorCode(error: unknown, fallback?: string): TurnErrorCode {
  if (error instanceof PathBoundaryError) return "path_unavailable";
  return knownCode(errorCode(error)) ??
    knownCode(error instanceof Error ? error.message : undefined) ??
    knownCode(fallback) ??
    "turn_failed";
}

function knownCode(candidate: string | undefined): TurnErrorCode | undefined {
  switch (candidate) {
    case "backend_unavailable":
    case "immutable_reference_mutated":
    case "immutable_reference_path_unavailable":
    case "immutable_reference_escaped":
    case "operation_conflict":
    case "operation_cancelled":
    case "publication_failed":
    case "turn_failed":
      return candidate;
    case "stage_attachment_input_invalid":
    case "private_input_unavailable":
      return "private_input_unavailable";
    case "invalid_name":
    case "outside_root":
    case "invalid_path":
    case "path_unavailable":
    case "project_path_unavailable":
      return "path_unavailable";
    default:
      return undefined;
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
