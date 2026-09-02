import { describe, expect, test } from "bun:test";
import { apiErrorCopy } from "../src/lib/error-copy";

class FakeApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const KNOWN_CODES = [
  "invalid_name",
  "invalid_backend",
  "invalid_project_options",
  "forbidden",
  "has_active_projects",
  "is_template",
  "network_error",
  "session_busy",
  "project_not_found",
  "invalid_source_url",
  "website_fetch_failed",
  "figma_token_missing",
  "upload_extract_failed",
  "unsafe_source_content",
];

describe("apiErrorCopy", () => {
  test("Given every documented ApiError code When mapped Then it returns Korean copy, never the raw message", () => {
    for (const code of KNOWN_CODES) {
      const englishMessage = `raw backend message for ${code}`;
      const copy = apiErrorCopy(new FakeApiError(code, englishMessage));
      expect(copy).not.toBe(englishMessage);
      expect(copy.length).toBeGreaterThan(0);
      expect(/[ㄱ-힝]/u.test(copy)).toBe(true);
    }
  });

  test("Given an unknown ApiError code When mapped Then it falls back to a generic Korean message", () => {
    const copy = apiErrorCopy(new FakeApiError("some_unmapped_code", "boom"));
    expect(copy).toBe("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  test("Given a plain Error without a code When mapped Then it falls back instead of showing the raw message", () => {
    const copy = apiErrorCopy(new Error("TypeError: fetch failed"));
    expect(copy).toBe("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  test("Given a non-error thrown value When mapped Then it still returns the generic fallback", () => {
    expect(apiErrorCopy("just a string")).toBe(
      "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(apiErrorCopy(null)).toBe(
      "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });

  test("Given has_active_projects When mapped Then the copy tells the user to delete the referencing projects", () => {
    const copy = apiErrorCopy(new FakeApiError("has_active_projects", "Active projects reference this system"));
    expect(copy).toContain("삭제");
  });
});
