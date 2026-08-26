import { ApiError } from "@/api/client";

/**
 * Mirrors the backend intake contract for early feedback only. The backend
 * remains authoritative, and composer-intake.test.ts pins supported kinds
 * against the real extractor.
 */
export const COMPOSER_ATTACHMENT_LIMITS = {
  maxCount: 8,
  maxBytesPerFile: 10 * 1024 * 1024,
  maxBytesTotal: 25 * 1024 * 1024,
} as const;

export const COMPOSER_SUPPORTED_EXTENSIONS = [".pdf", ".pptx"] as const;

export type IntakeRejection =
  | "unsupported_kind"
  | "too_large"
  | "count_exceeded"
  | "total_exceeded";

export type IntakeItem =
  | { readonly status: "ready"; readonly file: File }
  | {
      readonly status: "rejected";
      readonly file: File;
      readonly reason: IntakeRejection;
    };

export type SendOutcome =
  | { readonly kind: "cancelled" }
  | {
      readonly kind: "failed";
      readonly code: string;
      readonly message: string;
    };

/** Screens picked or dropped files into states the UI can truthfully show. */
export function planAttachmentIntake(
  current: readonly IntakeItem[],
  incoming: readonly File[],
): readonly IntakeItem[] {
  const items = [...current];
  for (const file of incoming) {
    const ready = items.filter((item) => item.status === "ready");
    const readyBytes = ready.reduce(
      (total, item) => total + item.file.size,
      0,
    );
    const reason = rejectionFor(file, ready.length, readyBytes);
    items.push(
      reason === null
        ? { status: "ready", file }
        : { status: "rejected", file, reason },
    );
  }
  return items;
}

export function readyAttachmentFiles(
  items: readonly IntakeItem[],
): readonly File[] {
  return items.flatMap((item) =>
    item.status === "ready" ? [item.file] : [],
  );
}

/**
 * An aborted request reports cancellation. Any other observed error stays
 * retryable without inferring server-side extraction progress.
 */
export function resolveSendOutcome(error: unknown): SendOutcome {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "cancelled" };
  }
  if (error instanceof ApiError) {
    return {
      kind: "failed",
      code: error.code,
      message: error.message,
    };
  }
  return {
    kind: "failed",
    code: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

function rejectionFor(
  file: File,
  readyCount: number,
  readyBytes: number,
): IntakeRejection | null {
  const name = file.name.toLowerCase();
  if (
    !COMPOSER_SUPPORTED_EXTENSIONS.some((extension) =>
      name.endsWith(extension),
    )
  ) {
    return "unsupported_kind";
  }
  if (file.size > COMPOSER_ATTACHMENT_LIMITS.maxBytesPerFile) {
    return "too_large";
  }
  if (readyCount >= COMPOSER_ATTACHMENT_LIMITS.maxCount) {
    return "count_exceeded";
  }
  if (readyBytes + file.size > COMPOSER_ATTACHMENT_LIMITS.maxBytesTotal) {
    return "total_exceeded";
  }
  return null;
}
