export type ArtifactIdentity = {
  readonly revision: number;
  readonly digest: string;
};

export class ArtifactIdentityError extends Error {
  readonly name = "ArtifactIdentityError";
  constructor(readonly code: "invalid_artifact_identity" | "stale_artifact_identity", message: string) { super(message); }
}

export function requireArtifactIdentity(expected: { readonly revision: unknown; readonly digest: unknown }, current: { readonly revision: number; readonly digest: string | null }): ArtifactIdentity {
  if (typeof expected.revision !== "number" || !Number.isSafeInteger(expected.revision) || expected.revision < 0 || typeof expected.digest !== "string" || expected.digest.length === 0) {
    throw new ArtifactIdentityError("invalid_artifact_identity", "Expected artifact revision and digest are required");
  }
  if (current.digest === null || expected.revision !== current.revision || expected.digest !== current.digest) {
    throw new ArtifactIdentityError("stale_artifact_identity", "Expected artifact identity is stale");
  }
  return { revision: expected.revision, digest: expected.digest };
}
