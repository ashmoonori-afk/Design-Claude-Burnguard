#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../packages/backend/node_modules/playwright-core";
import { findChromiumExecutable } from "./chromium";
import { coordinatedOwnedProcess } from "./cleanup-coordinator";
import { QaInputError, QaPreflightError, QaTimeoutError } from "./errors";
import { publishManifest } from "./manifest-publication";
import { runPreflight } from "./preflight";
import {
  assertRepositoryIdentity,
  readRepositoryIdentity,
} from "./repository";
import { isPortOwnedBy, OwnedResources, parseQaPort } from "./runtime";
import { SCENARIOS } from "./scenarios";

const SCENARIO_PATTERN = /^task-[1-9]\d*$/;
const ARGUMENT_KEYS = new Set([
  "--scenario",
  "--base-url",
  "--evidence-dir",
  "--backend-pid",
  "--backend-log",
  "--qa-home",
  "--cleanup-request",
  "--cleanup-ack",
]);

type RunnerArguments = {
  readonly scenario: string;
  readonly baseUrl: string;
  readonly evidenceDirectory: string;
  readonly backendPid?: number;
  readonly backendLog?: string;
  readonly qaHome?: string;
  readonly cleanupRequest?: string;
  readonly cleanupAck?: string;
};

function parseArguments(args: readonly string[]): RunnerArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      key === undefined ||
      value === undefined ||
      !ARGUMENT_KEYS.has(key)
    ) {
      throw new QaInputError("invalid_arguments", "Runner arguments must be flag/value pairs");
    }
    if (values.has(key)) {
      throw new QaInputError("duplicate_argument", `Duplicate argument ${key}`);
    }
    values.set(key, value);
  }
  const scenario = values.get("--scenario");
  const baseUrl = values.get("--base-url");
  const evidenceDirectory = values.get("--evidence-dir");
  if (
    scenario === undefined ||
    (scenario !== "all" && !SCENARIO_PATTERN.test(scenario))
  ) {
    throw new QaInputError("invalid_scenario", "Scenario must be task-N or all");
  }
  if (baseUrl === undefined || evidenceDirectory === undefined) {
    throw new QaInputError("missing_argument", "base-url and evidence-dir are required");
  }
  if (!URL.canParse(baseUrl)) {
    throw new QaInputError("invalid_base_url", "Base URL must be a valid URL");
  }
  const url = new URL(baseUrl);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/" ||
    url.port === ""
  ) {
    throw new QaInputError("invalid_base_url", "Base URL must be loopback HTTP authority");
  }
  parseQaPort(url.port);
  const pidValue = values.get("--backend-pid");
  const backendPid = pidValue === undefined ? undefined : Number(pidValue);
  if (backendPid !== undefined && (!Number.isSafeInteger(backendPid) || backendPid <= 0)) {
    throw new QaInputError("invalid_pid", "Backend PID must be a positive integer");
  }
  const backendLog = values.get("--backend-log");
  const qaHome = values.get("--qa-home");
  const cleanupRequest = values.get("--cleanup-request");
  const cleanupAck = values.get("--cleanup-ack");
  return {
    scenario,
    baseUrl: url.origin,
    evidenceDirectory,
    ...(backendPid === undefined ? {} : { backendPid }),
    ...(backendLog === undefined ? {} : { backendLog }),
    ...(qaHome === undefined ? {} : { qaHome }),
    ...(cleanupRequest === undefined ? {} : { cleanupRequest }),
    ...(cleanupAck === undefined ? {} : { cleanupAck }),
  };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(import.meta.dir, "../..");
  const appPort = Number(new URL(args.baseUrl).port);
  const preflight = await runPreflight(repoRoot, String(appPort + 1));
  const evidenceDirectory = path.resolve(args.evidenceDirectory);
  if (!evidenceDirectory.startsWith(`${preflight.attemptDirectory}${path.sep}`)) {
    throw new QaInputError("invalid_evidence_path", "Evidence must be inside the current attempt");
  }
  assertRepositoryIdentity(await readRepositoryIdentity(repoRoot), preflight.repository);
  const names = args.scenario === "all" ? [...SCENARIOS.keys()] : [args.scenario];
  if (names.some((name) => !SCENARIOS.has(name))) {
    throw new QaInputError("unregistered_scenario", "Scenario has not been registered");
  }
  if (
    args.backendPid === undefined ||
    args.backendLog === undefined ||
    args.qaHome === undefined ||
    args.cleanupRequest === undefined ||
    args.cleanupAck === undefined ||
    ![args.qaHome, args.cleanupRequest, args.cleanupAck].every(
      (value) => path.isAbsolute(value) && value.startsWith(`${preflight.attemptDirectory}${path.sep}`),
    )
  ) {
    throw new QaInputError("missing_runtime_identity", "Owned backend, log, and isolated HOME are required");
  }
  const resources = new OwnedResources();
  resources.trackProcess(coordinatedOwnedProcess({
    pid: args.backendPid,
    requestPath: args.cleanupRequest,
    acknowledgementPath: args.cleanupAck,
  }), appPort);
  resources.trackHome(args.qaHome);
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupt = (): void => { void resources.cleanup().finally(() => process.exit(130)); };
  for (const signal of signals) process.once(signal, interrupt);
  let cleanup;
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: await findChromiumExecutable(),
    });
    resources.trackBrowser(browser);
    const context = await browser.newContext();
    resources.trackContext(context);
    const page = await context.newPage();
    resources.trackPage(page);
    const actions = [];
    let backendDetected = false;
    for (const name of names) {
      const scenario = SCENARIOS.get(name);
      if (scenario === undefined) {
        throw new QaInputError("unregistered_scenario", "Scenario disappeared from registry");
      }
      const result = await scenario({
        baseUrl: args.baseUrl,
        evidenceDirectory,
        browserContext: context,
        page,
      });
      actions.push(...result.actions);
      backendDetected ||= result.backendDetected;
    }
    const bootstrapProof = await page.evaluate(async () => {
      const response = await fetch("/api/bootstrap");
      const body: unknown = await response.json();
      return {
        authorityReady: response.ok,
        capabilityReady:
          typeof body === "object" &&
          body !== null &&
          "data" in body &&
          typeof body.data === "object" &&
          body.data !== null &&
          "capability" in body.data &&
          typeof body.data.capability === "string" &&
          body.data.capability.length > 0,
      };
    });
    const exactLog = (await readFile(args.backendLog, "utf8")).split("\n").includes(
      `[burnguard] listening on ${args.baseUrl}`,
    );
    const portOwned = await isPortOwnedBy(appPort, args.backendPid);
    const readiness = {
      exactLog,
      processAlive: process.kill(args.backendPid, 0),
      portOwned,
      authorityReady: bootstrapProof.authorityReady,
      cookieReady: (await context.cookies()).some((cookie) => cookie.name === "burnguard_capability"),
      capabilityReady: bootstrapProof.capabilityReady,
    };
    if (!backendDetected || !Object.values(readiness).every(Boolean)) {
      throw new QaInputError("incomplete_readiness", "Real-app readiness proof is incomplete");
    }
    await resources.cleanup();
    cleanup = await resources.cleanup();
    const identity = {
      sessionId: "01a02e12-921d-71f9-9030-291d134ed7fa",
      attemptDirectory: preflight.attemptDirectory,
      runId: randomUUID(),
    };
    await publishManifest({
      version: 1,
      scenario: args.scenario,
      identity,
      repository: preflight.repository,
      readiness,
      authenticatedBackend: preflight.checks.authenticatedBackend,
      ownership: {
        backendPid: args.backendPid,
        port: appPort,
        browser: true,
        context: true,
        page: true,
        isolatedHome: true,
      },
      actions,
      cleanup,
      execution: { status: "succeeded", exitCode: 0 },
      promptInjection: "not_applicable",
      cancelResume: "interruption_cleanup",
    }, {
      evidenceDirectory,
      scenario: args.scenario,
      identity,
      repository: preflight.repository,
      backendPid: args.backendPid,
      port: appPort,
    });
  } finally {
    if (cleanup === undefined) await resources.cleanup();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof QaInputError || error instanceof QaPreflightError
        ? error.code
        : error instanceof QaTimeoutError
          ? "qa_timeout"
          : "qa_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exit(1);
  }
}

export const __testParseArguments = parseArguments;
