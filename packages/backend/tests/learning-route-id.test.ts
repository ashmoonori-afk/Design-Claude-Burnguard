import { beforeAll, describe, expect, test } from "bun:test";
import { getSqlite } from "../src/db/sqlite-client";
import { parseLearningId } from "../src/routes/learning-input";
import { learningRoutes } from "../src/routes/learning";
import { ensureLearningSchema } from "./learning-fixture";

const invalidRouteIds = [
  { label: "traversal", path: "..%2Fbad" },
  { label: "encoded traversal", path: "%252e%252e%252fbad" },
  { label: "slash", path: "bad%2Fslash" },
  { label: "backslash", path: "bad%5Cslash" },
  { label: "absolute", path: "%2Fabsolute" },
  { label: "drive absolute", path: "C%3A%5Cbad" },
  { label: "control", path: "bad%00id" },
  { label: "reserved", path: "CON" },
  { label: "malformed encoding", path: "%25ZZ" },
  { label: "oversized", path: "a".repeat(129) },
] as const;

beforeAll(() => ensureLearningSchema(getSqlite()));

describe("learning route identifier boundary", () => {
  test("rejects malformed route IDs before repository access", async () => {
    // Given
    const db = getSqlite();
    const before = db.query<{ readonly count: number }, []>("SELECT COUNT(*) count FROM learning_items").get()?.count;

    // When
    const results = await Promise.all(invalidRouteIds.map(async ({ label, path }) => {
      const response = await learningRoutes.request(`http://localhost/api/learning/items/${path}`);
      return { label, status: response.status, body: await response.json() };
    }));

    // Then
    expect(results).toEqual(invalidRouteIds.map(({ label }) => ({
      label,
      status: 400,
      body: { error: { code: "invalid_learning_id", message: "Invalid learning identifier", details: { field: "id" } } },
    })));
    expect(db.query<{ readonly count: number }, []>("SELECT COUNT(*) count FROM learning_items").get()?.count).toBe(before);
  });

  test("rejects an empty identifier at the shared parser boundary", () => {
    // Given
    const emptyId = "";

    // When / Then
    expect(() => parseLearningId(emptyId)).toThrow("Invalid learning identifier");
  });

  test("preserves typed not-found for a valid missing route ID", async () => {
    // Given
    const missingId = "valid-missing-id";

    // When
    const response = await learningRoutes.request(`http://localhost/api/learning/items/${missingId}`);

    // Then
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "learning_not_found" } });
  });
});
