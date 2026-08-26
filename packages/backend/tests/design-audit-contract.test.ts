import { describe, expect, test } from "bun:test";
import { DESIGN_AUDIT_CHECK_CODES, parseDesignAuditResult } from "@bg/shared";

const digest = "a".repeat(64);
const checks = DESIGN_AUDIT_CHECK_CODES.map((code) => ({ code, status: "pass", reason: null, findings: [] }));
const valid = { schema_version: 1, project_id: "project", artifact_revision: 0, artifact_digest: digest, created_at: 1, overall_status: "ready", checks };

describe("design audit result contract", () => {
  test("Given the canonical eight checks When parsed Then identity and order are preserved", () => {
    expect(parseDesignAuditResult(valid)).toEqual(valid);
  });

  test("Given malformed or inconsistent results When parsed Then each is rejected", () => {
    const malformed: readonly unknown[] = [
      { ...valid, extra: true },
      { ...valid, artifact_digest: "bad" },
      { ...valid, checks: checks.slice(1) },
      { ...valid, checks: checks.map((check, index) => index === 0 ? { ...check, code: "contrast" } : check) },
      { ...valid, overall_status: "ready", checks: checks.map((check, index) => index === 0 ? { ...check, status: "skipped" } : check) },
      { ...valid, overall_status: "recommended", checks: checks.map((check, index) => index === 0 ? { ...check, status: "skipped", reason: null } : check) },
      { ...valid, overall_status: "recommended", checks: checks.map((check, index) => index === 0 ? { ...check, status: "pass", reason: "no_measurable_candidates" } : check) },
      { ...valid, overall_status: "recommended", checks: checks.map((check, index) => index === 0 ? { ...check, status: "unmeasurable", reason: "invented" } : check) },
      { ...valid, overall_status: "recommended", checks: checks.map((check, index) => index === 0 ? { ...check, status: "fail", reason: null, findings: [] } : check) },
    ];
    for (const input of malformed) expect(() => parseDesignAuditResult(input)).toThrow();
  });

  test("Given a safe minimum-text patch When parsed Then all CAS fields remain exact", () => {
    const finding = { id: "minimum_text_size:index.html:tiny", check_code: "minimum_text_size", severity: "recommended", source: { rel_path: "index.html", node_bg_id: "tiny" }, evidence: "Rendered font size is 9px; minimum is 12px", measured: 9, threshold: 12, targeted_action: "set_minimum_font_size", safe_fix: { kind: "patch_html_node", rel_path: "index.html", request: { expected_revision: 0, expected_artifact_digest: digest, expected_file_hash: "b".repeat(64), node_bg_id: "tiny", node_fingerprint: "c".repeat(64), styles: { "font-size": "12px" } } } };
    const input = { ...valid, overall_status: "recommended", checks: checks.map((check) => check.code === "minimum_text_size" ? { ...check, status: "fail", reason: null, findings: [finding] } : check) };
    expect(parseDesignAuditResult(input).checks[2]?.findings[0]).toEqual(finding);
  });
});
