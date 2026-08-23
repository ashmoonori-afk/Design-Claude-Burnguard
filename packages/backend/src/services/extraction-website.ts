import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import {
  AcquisitionLimitError,
  DEFAULT_ACQUISITION_LIMITS,
  abortable,
  throwIfAcquisitionAborted,
  type AcquisitionLimits,
} from "./extraction-acquisition";
import { DesignSystemExtractError } from "./extraction-errors";
import { isUnsafeImportHostname, normalizeImportHostname } from "./extraction-path";
import { isOwnedQaAdapterResourceUrl, qaAdapterRequestHeaders } from "./extraction-qa-adapter";

export type WebsiteFetchOptions = {
  readonly maxBytes: number;
  readonly kind: "html" | "css" | "asset";
  readonly noteBytes: (bytes: number) => void;
  readonly signal: AbortSignal;
  readonly userAgent: string;
  readonly limits?: AcquisitionLimits;
};

export async function fetchWebsiteResource(
  inputUrl: URL,
  options: WebsiteFetchOptions,
): Promise<{ readonly finalUrl: URL; readonly text: string; readonly buffer: Buffer }> {
  let current = new URL(inputUrl.toString());
  const limits = options.limits ?? DEFAULT_ACQUISITION_LIMITS;
  for (let redirectCount = 0; redirectCount <= limits.redirects; redirectCount += 1) {
    await assertSafeImportUrl(current, options.signal);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": options.userAgent, ...qaAdapterRequestHeaders(current) },
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal.aborted) throwIfAcquisitionAborted(options.signal);
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new DesignSystemExtractError("website_fetch_failed", `Redirect missing Location header for ${current.toString()}`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new DesignSystemExtractError("website_fetch_failed", `Website fetch failed with HTTP ${response.status}`);
    const buffer = await readResponseWithinLimit(response, options.maxBytes, options.signal, limits, options.kind);
    options.noteBytes(buffer.byteLength);
    return { finalUrl: current, text: options.kind === "asset" ? "" : buffer.toString("utf8"), buffer };
  }
  throw new AcquisitionLimitError("redirects", limits.redirects, limits.redirects + 1);
}

export function assertAssetCount(count: number, limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS): void {
  if (count > limits.assets) throw new AcquisitionLimitError("assets", limits.assets, count);
}

export function assertAggregateAssetBytes(bytes: number, limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS): void {
  if (bytes > limits.assetBytes) throw new AcquisitionLimitError("asset_bytes", limits.assetBytes, bytes);
}

async function readResponseWithinLimit(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  limits: AcquisitionLimits,
  kind: WebsiteFetchOptions["kind"],
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfAcquisitionAborted(signal);
      const { done, value } = await abortable(reader.read(), signal, () => { void reader.cancel(); });
      throwIfAcquisitionAborted(signal);
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        const limit = kind === "html" ? "html_bytes" : kind === "css" ? "css_bytes" : "asset_bytes";
        throw new AcquisitionLimitError(limit, maxBytes, total);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  } finally {
    reader.releaseLock();
  }
}

async function assertSafeImportUrl(url: URL, signal: AbortSignal): Promise<void> {
  throwIfAcquisitionAborted(signal);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DesignSystemExtractError("invalid_source_url", `Website URL must be http(s): ${url.toString()}`);
  }
  const host = normalizeImportHostname(url.hostname);
  const ownedQaAdapter = isOwnedQaAdapterResourceUrl(url);
  if (isUnsafeImportHostname(host) && !ownedQaAdapter) {
    throw new DesignSystemExtractError("invalid_source_url", `Blocked private or local website host: ${url.hostname}`);
  }
  if (isIP(host) !== 0) return;
  const resolver = new Resolver();
  const resolved = await abortable(resolver.resolveAny(host).catch(() => []), signal, () => resolver.cancel());
  for (const entry of resolved) {
    if (!('address' in entry)) continue;
    if (isUnsafeImportHostname(normalizeImportHostname(entry.address))) {
      throw new DesignSystemExtractError("invalid_source_url", `Blocked hostname resolved to a private or local address: ${url.hostname}`);
    }
  }
}
