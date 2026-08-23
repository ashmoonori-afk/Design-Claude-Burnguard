import { createHash } from "node:crypto";
import path from "node:path";
import { QaPreflightError, QaTimeoutError } from "./errors";

export const EXPECTED_BRANCH = "feat/burnguard-design-pipeline-upgrade-20260823";
export const EXPECTED_ORIGIN = "https://github.com/ashmoonori-afk/Design-Claude-Burnguard.git";
export const EXPECTED_BASE = "b016bb84e3157e10d2ec7cffebaa25681f58def3";

export type RepositoryIdentity = {
  readonly root: string;
  readonly branch: string;
  readonly origin: string;
  readonly base: string;
  readonly head: string;
  readonly tree: string;
  readonly statusDigest: string;
  readonly statusCount: number;
};

export type RepositoryExpectation = RepositoryIdentity;

function isProductStateEntry(entry: string): boolean {
  const relative = entry.slice(3);
  return relative !== ".debug-journal.md" && !relative.startsWith(".omo/");
}

async function git(
  root: string,
  args: readonly string[],
  timeoutMs = 5_000,
): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      child.kill();
      reject(new QaTimeoutError(`git ${args[0] ?? "command"}`));
    }, timeoutMs);
  });
  try {
    const [exitCode, output] = await Promise.race([
      Promise.all([child.exited, new Response(child.stdout).text()]),
      timeout,
    ]);
    if (exitCode !== 0) {
      throw new QaPreflightError("git_failed", `git ${args[0] ?? "command"} failed`);
    }
    return output.trim();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readRepositoryIdentity(root: string): Promise<RepositoryIdentity> {
  const [actualRoot, branch, origin, head, tree, baseCheck, rawStatus, trackedDiff] = await Promise.all([
    git(root, ["rev-parse", "--show-toplevel"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["remote", "get-url", "origin"]),
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "HEAD^{tree}"]),
    git(root, ["merge-base", "--is-ancestor", EXPECTED_BASE, "HEAD"]),
    git(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    git(root, ["diff", "--binary", "HEAD", "--", ".", ":(exclude).omo", ":(exclude).debug-journal.md"]),
  ]);
  if (baseCheck !== "") {
    throw new QaPreflightError("base_mismatch", "Expected base is not an ancestor of HEAD");
  }
  const status = rawStatus === ""
    ? []
    : rawStatus.split("\n").filter(isProductStateEntry).sort();
  const digest = createHash("sha256").update(status.join("\n")).update(trackedDiff);
  for (const entry of status) {
    if (!entry.startsWith("?? ")) continue;
    const relative = entry.slice(3);
    const content = await Bun.file(path.join(root, relative)).arrayBuffer();
    digest.update(relative).update(new Uint8Array(content));
  }
  return {
    root: path.resolve(actualRoot),
    branch,
    origin,
    base: EXPECTED_BASE,
    head,
    tree,
    statusDigest: digest.digest("hex"),
    statusCount: status.length,
  };
}

export function assertRepositoryIdentity(
  actual: RepositoryIdentity,
  expected: RepositoryExpectation,
): void {
  const scalarKeys = ["root", "branch", "origin", "base", "head", "tree"] as const;
  for (const key of scalarKeys) {
    if (actual[key] !== expected[key]) {
      throw new QaPreflightError("stale_repository", `Repository ${key} changed`);
    }
  }
  if (
    actual.statusDigest !== expected.statusDigest ||
    actual.statusCount !== expected.statusCount
  ) {
    throw new QaPreflightError("dirty_worktree_delta", "Working tree changed after preflight");
  }
}

export function assertExpectedRepository(
  identity: RepositoryIdentity,
  scriptDirectory: string,
): void {
  const expectedRoot = path.resolve(scriptDirectory, "../..");
  if (identity.root !== expectedRoot) {
    throw new QaPreflightError("wrong_root", "Preflight is not running in the expected repository");
  }
  if (identity.branch !== EXPECTED_BRANCH) {
    throw new QaPreflightError("wrong_branch", "Preflight is running on the wrong branch");
  }
  if (identity.origin !== EXPECTED_ORIGIN) {
    throw new QaPreflightError("wrong_origin", "Preflight found an unexpected origin");
  }
}
