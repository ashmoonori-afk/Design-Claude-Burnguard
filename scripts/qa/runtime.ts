import { QaPreflightError, QaTimeoutError } from "./errors";
import { isPortOwnedBy } from "./port";
export { OwnedResources } from "./cleanup";
export type { CleanupOperations, CleanupReceipt } from "./cleanup";
export { isPortFree, isPortOwnedBy, parseQaPort } from "./port";

export type BootstrapReceipt = {
  readonly authorityReady: boolean;
  readonly cookieReady: boolean;
  readonly capabilityReady: boolean;
};

export type ReadinessReceipt = BootstrapReceipt & {
  readonly exactLog: boolean;
  readonly processAlive: boolean;
  readonly portOwned: boolean;
  readonly manifestReady: boolean;
};

export async function bootstrapAuthority(baseUrl: string): Promise<BootstrapReceipt> {
  const response = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Origin: baseUrl },
    signal: AbortSignal.timeout(3_000),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { authorityReady: false, cookieReady: false, capabilityReady: false };
    }
    throw error;
  }
  const capabilityReady =
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof body.data === "object" &&
    body.data !== null &&
    "capability" in body.data &&
    typeof body.data.capability === "string" &&
    body.data.capability.length > 0;
  return {
    authorityReady: response.ok,
    cookieReady: response.headers.get("set-cookie")?.includes("burnguard_capability=") === true,
    capabilityReady,
  };
}

type ReadinessOptions = {
  readonly child: Bun.Subprocess<"ignore" | "pipe", "pipe", "pipe">;
  readonly expectedLine: string;
  readonly port: number;
  readonly manifestReady: () => boolean;
  readonly timeoutMs?: number;
};

export async function waitForExactReadiness(
  options: ReadinessOptions,
): Promise<ReadinessReceipt> {
  const { child, expectedLine, port, manifestReady, timeoutMs = 10_000 } = options;
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QaTimeoutError("backend readiness")), timeoutMs);
  });
  const exactLog = (async (): Promise<boolean> => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      if (lines.some((line) => line.replace(/\r$/, "") === expectedLine)) return true;
    }
  })();
  try {
    const found = await Promise.race([
      exactLog,
      child.exited.then(() => false),
      timeout,
    ]);
    if (!found) {
      throw new QaPreflightError("readiness_missing", "Backend exited without exact readiness");
    }
    const baseUrl = `http://127.0.0.1:${port}`;
    const portOwned = await isPortOwnedBy(port, child.pid);
    if (!portOwned) {
      throw new QaPreflightError("port_identity_mismatch", "Backend does not own the QA port");
    }
    const bootstrap = await bootstrapAuthority(baseUrl);
    const receipt = {
      exactLog: true,
      processAlive: child.exitCode === null,
      portOwned,
      manifestReady: manifestReady(),
      ...bootstrap,
    };
    if (!Object.values(receipt).every(Boolean)) {
      throw new QaPreflightError("incomplete_readiness", "Readiness proof is incomplete");
    }
    return receipt;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await reader.cancel();
  }
}

