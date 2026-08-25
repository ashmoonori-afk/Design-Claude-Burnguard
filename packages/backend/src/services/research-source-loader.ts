import { isUnsafeImportHostname } from "./extraction-path";
import { ExtractionSafetyError, parseSafeExtractionUrl } from "./extraction-safety";
import type { CanonicalResearchSource, FetchedResearchSource, ResearchSourceDocument } from "./research-orchestrator";

export class ResearchSourceLoadError extends Error {
  readonly name = "ResearchSourceLoadError";
  constructor(readonly code: "unsafe_source" | "fetch_failed" | "malformed_source" | "source_too_large", message: string) { super(message); }
}

export type ResearchTransport = (url: URL, init: { readonly redirect: "error"; readonly signal: AbortSignal; readonly headers: Readonly<Record<string, string>> }) => Promise<Response>;
export type NetworkSourceInput = { readonly source: CanonicalResearchSource; readonly maxBytes: number; readonly request: ResearchTransport };
type SourceReadResult = { readonly done: false; readonly value: Uint8Array } | { readonly done: true; readonly value?: undefined };

export async function loadNetworkResearchSource(input: NetworkSourceInput, signal: AbortSignal): Promise<FetchedResearchSource> {
  const url = safeUrl(input.source.canonicalLocator);
  if (isUnsafeImportHostname(url.hostname)) throw new ResearchSourceLoadError("unsafe_source", `Blocked private or local research host: ${url.hostname}`);
  let response: Response;
  try {
    response = await input.request(url, { redirect: "error", signal, headers: { accept: "application/json", "user-agent": "Burnguard-Research/1" } });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof ResearchSourceLoadError) throw error;
    throw new ResearchSourceLoadError("fetch_failed", error instanceof Error ? error.message : "Research source fetch failed");
  }
  if (!response.ok) throw new ResearchSourceLoadError("fetch_failed", `Research source returned HTTP ${response.status}`);
  const finalUrl = response.url.length === 0 ? url : safeUrl(response.url);
  if (isUnsafeImportHostname(finalUrl.hostname)) throw new ResearchSourceLoadError("unsafe_source", `Blocked private or local redirect host: ${finalUrl.hostname}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new ResearchSourceLoadError("malformed_source", "Research source must be application/json");
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > input.maxBytes) throw new ResearchSourceLoadError("source_too_large", "Research source exceeds its byte limit");
  const bytes = await readBounded(response, input.maxBytes, signal);
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) { if (error instanceof SyntaxError || error instanceof TypeError) throw new ResearchSourceLoadError("malformed_source", "Research source is not valid UTF-8 JSON"); throw error; }
  return { bytes, finalUrl: finalUrl.toString(), httpStatus: response.status, document: parseResearchSourceDocument(raw) };
}

export function parseResearchSourceDocument(input: unknown): ResearchSourceDocument {
  if (!record(input) || !exact(input, ["schema_version", "title", "claims"]) || input["schema_version"] !== 1 || !text(input["title"]) || !Array.isArray(input["claims"])) malformed();
  const claims = input["claims"].map((claim) => {
    if (!record(claim) || !exact(claim, ["axis", "text"]) || !text(claim["axis"]) || !text(claim["text"])) malformed();
    return { axis: claim["axis"], text: claim["text"] };
  });
  if (claims.length === 0) malformed();
  return { schema_version: 1, title: input["title"], claims };
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const chunk = await readChunk(reader, signal);
      if (signal.aborted) throw signal.reason;
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new ResearchSourceLoadError("source_too_large", "Research source exceeds its byte limit"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<SourceReadResult> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", abort);
    const abort = (): void => { void reader.cancel().then(() => reject(signal.reason), reject); };
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

function safeUrl(value: string): URL {
  try { return parseSafeExtractionUrl(value); }
  catch (error) { if (error instanceof ExtractionSafetyError) throw new ResearchSourceLoadError("unsafe_source", error.message); throw error; }
}
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function malformed(): never { throw new ResearchSourceLoadError("malformed_source", "Research source document is malformed"); }
