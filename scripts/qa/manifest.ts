import { ULW_SESSION_ID } from "./evidence";
import { QaInputError } from "./errors";
import type { RepositoryIdentity } from "./repository";
import type { CleanupReceipt, ReadinessReceipt } from "./runtime";
import { attemptId, stableDigest } from "./sanitization";

const ACTION_KINDS = ["navigate", "assert", "screenshot", "cleanup"] as const;
type ActionKind = (typeof ACTION_KINDS)[number];

export type SanitizedAction = {
  readonly kind: ActionKind;
  readonly name: string;
  readonly passed: boolean;
  readonly artifact?: string;
};
export type ManifestIdentity = {
  readonly sessionId: string;
  readonly attemptDirectory: string;
  readonly runId: string;
};
export type EvidenceManifest = {
  readonly version: 1;
  readonly scenario: string;
  readonly identity: ManifestIdentity;
  readonly repository: RepositoryIdentity;
  readonly readiness: ReadinessReceipt;
  readonly authenticatedBackend: boolean;
  readonly ownership: {
    readonly backendPid: number;
    readonly port: number;
    readonly browser: true;
    readonly context: true;
    readonly page: true;
    readonly isolatedHome: true;
  };
  readonly actions: readonly SanitizedAction[];
  readonly cleanup: CleanupReceipt;
  readonly execution: { readonly status: "succeeded"; readonly exitCode: 0 };
  readonly promptInjection: "not_applicable";
  readonly cancelResume: "interruption_cleanup";
};
export type ManifestDraft = Omit<EvidenceManifest, "readiness"> & {
  readonly readiness: Omit<ReadinessReceipt, "manifestReady">;
};
export type ManifestExpectation = {
  readonly evidenceDirectory: string;
  readonly scenario: string;
  readonly identity: ManifestIdentity;
  readonly repository: RepositoryIdentity;
  readonly backendPid: number;
  readonly port: number;
};

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, code = "invalid_manifest"): ObjectValue {
  if (!isObject(value)) throw new QaInputError(code, "Expected a machine object");
  return value;
}

function exactString(value: unknown, expected: string, code: string): string {
  if (value !== expected) throw new QaInputError(code, `Unexpected ${code}`);
  return expected;
}

function parseRepository(value: unknown, expected: RepositoryIdentity): RepositoryIdentity {
  const repository = object(value);
  exactString(repository["root"], "<repo>", "stale_root");
  exactString(repository["rootDigest"], stableDigest(expected.root), "stale_root");
  for (const key of ["branch", "origin", "base", "head", "tree", "statusDigest"] as const) {
    exactString(repository[key], expected[key], `stale_${key}`);
  }
  if (repository["statusCount"] !== expected.statusCount) {
    throw new QaInputError("stale_status", "Repository status changed");
  }
  return expected;
}

function parseIdentity(
  value: unknown,
  expected: ManifestIdentity,
  repositoryRoot: string,
): ManifestIdentity {
  const identity = object(value);
  exactString(identity["sessionId"], ULW_SESSION_ID, "stale_session");
  exactString(identity["sessionId"], expected.sessionId, "stale_session");
  exactString(identity["attemptDirectory"], "<attempt>", "stale_attempt");
  exactString(
    identity["attemptId"],
    attemptId(repositoryRoot, expected.attemptDirectory),
    "stale_attempt",
  );
  exactString(identity["runId"], expected.runId, "stale_run");
  return expected;
}

function allTrue(value: unknown, keys: readonly string[], code: string): void {
  const receipt = object(value);
  if (!keys.every((key) => receipt[key] === true)) {
    throw new QaInputError(code, `${code} is incomplete`);
  }
}

export function parseSanitizedAction(value: unknown): SanitizedAction {
  const action = object(value, "invalid_action");
  const kind = action["kind"];
  const name = action["name"];
  const passed = action["passed"];
  const artifact = action["artifact"];
  if (
    typeof kind !== "string" ||
    !ACTION_KINDS.some((candidate) => candidate === kind) ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof passed !== "boolean" ||
    (artifact !== undefined && typeof artifact !== "string")
  ) {
    throw new QaInputError("invalid_action", "Action has unsupported fields");
  }
  const parsedKind = ACTION_KINDS.find((candidate) => candidate === kind);
  if (parsedKind === undefined) throw new QaInputError("invalid_action", "Action kind is invalid");
  return artifact === undefined
    ? { kind: parsedKind, name, passed }
    : { kind: parsedKind, name, passed, artifact };
}

function parseValue(
  value: unknown,
  expected: ManifestExpectation,
  manifestReady: boolean,
): EvidenceManifest {
  const manifest = object(value);
  if (manifest["version"] !== 1) throw new QaInputError("invalid_version", "Manifest version is invalid");
  exactString(manifest["scenario"], expected.scenario, "stale_scenario");
  const identity = parseIdentity(
    manifest["identity"],
    expected.identity,
    expected.repository.root,
  );
  const repository = parseRepository(manifest["repository"], expected.repository);
  const readinessKeys = [
    "exactLog", "processAlive", "portOwned", "authorityReady", "cookieReady", "capabilityReady",
  ] as const;
  allTrue(manifest["readiness"], readinessKeys, "false_readiness");
  const readinessValue = object(manifest["readiness"]);
  if (readinessValue["manifestReady"] !== manifestReady) {
    throw new QaInputError("manifest_not_ready", "Manifest readiness is stale");
  }
  if (manifest["authenticatedBackend"] !== true) {
    throw new QaInputError("backend_not_authenticated", "Authenticated backend is required");
  }
  const ownership = object(manifest["ownership"]);
  if (ownership["backendPid"] !== expected.backendPid || ownership["port"] !== expected.port) {
    throw new QaInputError("stale_runtime", "Backend runtime identity changed");
  }
  allTrue(ownership, ["browser", "context", "page", "isolatedHome"], "incomplete_ownership");
  if (!Array.isArray(manifest["actions"]) || manifest["actions"].length === 0) {
    throw new QaInputError("missing_actions", "Manifest actions are required");
  }
  const actions = manifest["actions"].map(parseSanitizedAction);
  if (!actions.every((action) => action.passed)) {
    throw new QaInputError("failed_action", "Every action must pass");
  }
  const cleanupKeys = [
    "processesExited", "portsFree", "browsersClosed", "homesRemoved", "repeatedCleanupSafe",
  ] as const;
  allTrue(manifest["cleanup"], cleanupKeys, "incomplete_cleanup");
  const execution = object(manifest["execution"]);
  if (execution["status"] !== "succeeded" || execution["exitCode"] !== 0) {
    throw new QaInputError("execution_failed", "Successful execution must exit zero");
  }
  exactString(manifest["promptInjection"], "not_applicable", "invalid_prompt_injection");
  exactString(manifest["cancelResume"], "interruption_cleanup", "invalid_cancel_resume");
  return {
    version: 1,
    scenario: expected.scenario,
    identity,
    repository,
    readiness: {
      exactLog: true,
      processAlive: true,
      portOwned: true,
      manifestReady,
      authorityReady: true,
      cookieReady: true,
      capabilityReady: true,
    },
    authenticatedBackend: true,
    ownership: {
      backendPid: expected.backendPid,
      port: expected.port,
      browser: true,
      context: true,
      page: true,
      isolatedHome: true,
    },
    actions,
    cleanup: {
      processesExited: true,
      portsFree: true,
      browsersClosed: true,
      homesRemoved: true,
      repeatedCleanupSafe: true,
    },
    execution: { status: "succeeded", exitCode: 0 },
    promptInjection: "not_applicable",
    cancelResume: "interruption_cleanup",
  };
}

function parseRaw(
  raw: string,
  expected: ManifestExpectation,
  ready: boolean,
): EvidenceManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) throw new QaInputError("invalid_manifest_json", "Manifest JSON is invalid");
    throw error;
  }
  return parseValue(value, expected, ready);
}

export function parseEvidenceManifest(raw: string, expected: ManifestExpectation): EvidenceManifest {
  return parseRaw(raw, expected, true);
}

export function parsePendingEvidenceManifest(
  raw: string,
  expected: ManifestExpectation,
): EvidenceManifest {
  return parseRaw(raw, expected, false);
}

