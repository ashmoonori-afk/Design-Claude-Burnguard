import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logsDir } from "../lib/paths";

function sessionTracePath(sessionId: string) {
  return path.join(logsDir, `${sessionId}.trace.log`);
}

export async function appendSessionTrace(
  sessionId: string,
  record: Record<string, unknown>,
) {
  await mkdir(logsDir, { recursive: true });
  const line = `${JSON.stringify({ ts: Date.now(), ...record })}\n`;
  await appendFile(sessionTracePath(sessionId), line, "utf8");
}

