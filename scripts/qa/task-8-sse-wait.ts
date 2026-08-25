import { appendFile, writeFile } from "node:fs/promises";

const [url, patternSource, readyPath, outputPath, capability, origin, diagnosticsPath] = process.argv.slice(2);
if (url === undefined || patternSource === undefined || readyPath === undefined || outputPath === undefined || capability === undefined || origin === undefined || diagnosticsPath === undefined) throw new TypeError("url pattern ready output capability origin diagnostics required");
const note = async (value: Readonly<Record<string, unknown>>): Promise<void> => { await appendFile(diagnosticsPath, `${JSON.stringify({ ts: Date.now(), ...value })}\n`); };
try {
  await note({ state: "connecting", url, pattern: patternSource }); const response = await fetch(url, { headers: { cookie: `burnguard_capability=${capability}`, origin, "x-burnguard-capability": capability }, signal: AbortSignal.timeout(300_000) });
  await note({ state: "connected", status: response.status }); if (!response.ok || response.body === null) throw new TypeError(`SSE connection failed: ${response.status}`); await writeFile(readyPath, "ready\n");
  const pattern = new RegExp(patternSource); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffered = ""; let matched = false;
  for (;;) {
    const next = await reader.read(); if (next.done) throw new TypeError("SSE ended before expected export event"); buffered += decoder.decode(next.value, { stream: true }); const lines = buffered.split("\n"); buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) await note({ state: "data", line });
      if (pattern.test(line)) { await note({ state: "matched", line }); await writeFile(outputPath, `${line}\n`); matched = true; break; }
    }
    if (matched) { await reader.cancel(); break; }
  }
} catch (error) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error); await note({ state: "error", message }); await writeFile(outputPath, `__BG_SSE_WAITER_ERROR__:${message}\n`); process.exitCode = 1;
}
