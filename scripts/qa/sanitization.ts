import { createHash } from "node:crypto";
import path from "node:path";
import type { RepositoryIdentity } from "./repository";

export type EvidenceRepository = Omit<RepositoryIdentity, "root"> & {
  readonly root: "<repo>";
  readonly rootDigest: string;
};

export function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function repositoryForEvidence(identity: RepositoryIdentity): EvidenceRepository {
  const { root: omittedRoot, ...stable } = identity;
  return {
    ...stable,
    root: "<repo>",
    rootDigest: stableDigest(omittedRoot),
  };
}

export function attemptId(repoRoot: string, attemptDirectory: string): string {
  return path.relative(repoRoot, attemptDirectory);
}

export function sanitizeEvidenceText(
  value: string,
  repoRoot: string,
  home: string,
): string {
  return value.replaceAll(repoRoot, "<repo>").replaceAll(home, "<home>");
}
