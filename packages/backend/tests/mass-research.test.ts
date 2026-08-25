import { describe, expect, test } from "bun:test";
import { parseResearchRequestV1 } from "@bg/shared";
import happyFixture from "../../../scripts/qa/fixtures/mass-research.json";
import { buildHappyReceipt } from "../../../scripts/qa/mass-research-dry-run";
import {
  QaResourceTracker,
  runAdversarialCases,
  type CaseName,
} from "../../../scripts/qa/mass-research-scenarios";

const FAILURE_CASES = [
  "timeout",
  "fetch_failure",
  "malformed_duplicate",
  "partial_worker_failure",
  "cancellation",
  "restart_recovery",
  "override_precedence",
  "unknown_purpose",
] as const satisfies readonly CaseName[];

describe("mass research acceptance", () => {
  test("Given the checked-in fixture When product research runs Then its receipt preserves deterministic evidence", async () => {
    const tracker = new QaResourceTracker();
    const receipt = await buildHappyReceipt(
      parseResearchRequestV1(happyFixture.request),
      undefined,
      tracker,
    );

    expect(receipt).toMatchObject({
      ok: true,
      bounded_concurrency: true,
      digest: receipt.execution.result_digest,
    });
    expect(receipt.common_rules.length).toBeGreaterThan(0);
    expect(receipt.purpose_rules.length).toBeGreaterThan(0);
    expect(receipt.provenance.every((item) => item.locator !== undefined)).toBe(
      true,
    );
    expect(tracker.cleanup()).toEqual({
      complete: true,
      active_resources: 0,
      temporary_files: 0,
    });
  });

  test("Given every adversarial fixture case When product modules execute Then all failures stay isolated and clean", async () => {
    const tracker = new QaResourceTracker();
    const results = await runAdversarialCases(FAILURE_CASES, tracker);

    expect(results).toEqual(
      FAILURE_CASES.map((name) => ({ name, passed: true })),
    );
    expect(tracker.cleanup()).toEqual({
      complete: true,
      active_resources: 0,
      temporary_files: 0,
    });
  });
});
