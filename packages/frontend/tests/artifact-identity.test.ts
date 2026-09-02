import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/api/client";
import { isStaleIdentityError, readFileIdentity } from "../src/lib/artifact-identity";

const IDENTITY_HEADERS = {
  "X-Burnguard-Revision": "7",
  "X-Burnguard-Artifact-Digest": "digest-7",
  "X-Burnguard-File-Hash": "file-hash",
  "X-Burnguard-Node-Fingerprint": "node-fp",
};

function identityFetch(
  headers: Record<string, string>,
  seen: string[] = [],
): (path: string) => Promise<Response> {
  return async (path: string) => {
    seen.push(path);
    return new Response("<html></html>", { status: 200, headers });
  };
}

describe("readFileIdentity", () => {
  test("parses the four identity headers into a PATCH body", async () => {
    const seen: string[] = [];
    const identity = await readFileIdentity(
      "project-1",
      "pages/한글 페이지.html",
      "bg-42",
      identityFetch(IDENTITY_HEADERS, seen),
    );

    expect(identity).toEqual({
      expected_revision: 7,
      expected_artifact_digest: "digest-7",
      expected_file_hash: "file-hash",
      node_fingerprint: "node-fp",
    });
    expect(seen).toEqual([
      `/api/projects/project-1/fs/pages/${encodeURIComponent("한글 페이지.html")}?node_bg_id=bg-42`,
    ]);
  });

  test("fails when an identity header is missing instead of sending a partial body", async () => {
    for (const missing of Object.keys(IDENTITY_HEADERS)) {
      const headers = { ...IDENTITY_HEADERS } as Record<string, string>;
      delete headers[missing];
      const promise = readFileIdentity("p", "index.html", "bg-1", identityFetch(headers));
      await expect(promise).rejects.toMatchObject({
        code: "artifact_identity_unavailable",
      });
    }
  });

  test("surfaces the backend error code when the file read fails", async () => {
    const failing = async () =>
      Response.json(
        { error: { code: "node_not_found", message: "gone" } },
        { status: 422 },
      );

    await expect(
      readFileIdentity("p", "index.html", "bg-1", failing),
    ).rejects.toMatchObject({ code: "node_not_found", status: 422 });
  });
});

describe("isStaleIdentityError", () => {
  test("detects the conflict statuses and the stale code", () => {
    expect(isStaleIdentityError(new ApiError("stale_artifact_identity", "", 409))).toBe(true);
    expect(isStaleIdentityError(new ApiError("expected_revision_conflict", "", 412))).toBe(true);
    expect(isStaleIdentityError(new ApiError("stale_artifact_identity", "", 400))).toBe(true);
  });

  test("leaves other failures to their own copy", () => {
    expect(isStaleIdentityError(new ApiError("invalid_artifact_identity", "", 400))).toBe(false);
    expect(isStaleIdentityError(new Error("offline"))).toBe(false);
    expect(isStaleIdentityError(null)).toBe(false);
  });
});
