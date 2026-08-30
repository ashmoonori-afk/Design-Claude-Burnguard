import { QaInputError } from "./errors";

export function parseQaPort(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new QaInputError("invalid_port", "QA port must be a decimal integer");
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new QaInputError("invalid_port", "QA port must be between 1024 and 65535");
  }
  return port;
}

export async function isPortFree(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response(null, { status: 204 }),
    });
    await server.stop(true);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      return false;
    }
    throw error;
  }
}

async function portOwnerPids(port: number): Promise<readonly number[]> {
  const child = Bun.spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [exitCode, output] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0 && output.trim() === "") return [];
  return output.trim().split("\n").filter((line) => /^\d+$/.test(line)).map(Number);
}

export async function isPortOwnedBy(port: number, pid: number): Promise<boolean> {
  const owners = await portOwnerPids(port);
  return owners.length === 1 && owners[0] === pid;
}
