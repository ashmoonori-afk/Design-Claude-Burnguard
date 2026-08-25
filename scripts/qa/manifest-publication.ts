import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { QaInputError } from "./errors";
import {
  parseEvidenceManifest,
  parsePendingEvidenceManifest,
  type EvidenceManifest,
  type ManifestDraft,
  type ManifestExpectation,
} from "./manifest";
import { attemptId, repositoryForEvidence } from "./sanitization";

function forEvidence(
  draft: ManifestDraft,
  expected: ManifestExpectation,
  ready: boolean,
): unknown {
  return {
    ...draft,
    identity: {
      ...draft.identity,
      attemptDirectory: "<attempt>",
      attemptId: attemptId(expected.repository.root, expected.identity.attemptDirectory),
    },
    repository: repositoryForEvidence(draft.repository),
    readiness: { ...draft.readiness, manifestReady: ready },
  };
}

async function atomicWrite(output: string, value: unknown): Promise<void> {
  const temporary = `${output}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, output);
}

export async function readEvidenceManifest(
  output: string,
  expected: ManifestExpectation,
): Promise<EvidenceManifest> {
  try {
    return parseEvidenceManifest(await readFile(output, "utf8"), expected);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new QaInputError("manifest_missing", "Manifest does not exist");
    }
    throw error;
  }
}

export async function publishManifest(
  draft: ManifestDraft,
  expected: ManifestExpectation,
): Promise<EvidenceManifest> {
  const directory = path.resolve(expected.evidenceDirectory);
  if (
    directory !== expected.evidenceDirectory ||
    directory !== expected.identity.attemptDirectory &&
      !directory.startsWith(`${expected.identity.attemptDirectory}${path.sep}`)
  ) {
    throw new QaInputError("invalid_evidence_path", "Evidence is outside the current attempt");
  }
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, "manifest.json");
  await atomicWrite(output, forEvidence(draft, expected, false));
  parsePendingEvidenceManifest(await readFile(output, "utf8"), expected);
  await atomicWrite(output, forEvidence(draft, expected, true));
  return await readEvidenceManifest(output, expected);
}
