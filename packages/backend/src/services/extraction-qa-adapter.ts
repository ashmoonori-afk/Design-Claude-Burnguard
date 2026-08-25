const SECRET_HEADER = "x-burnguard-qa-adapter-secret";

export type QaAdapterConfiguration = {
  readonly sourceUrl: URL;
  readonly stallUrl: URL;
  readonly resourceUrls: ReadonlySet<string>;
  readonly secret: string;
};

export function qaAdapterConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): QaAdapterConfiguration | null {
  const sourceUrl = parseOwnedUrl(env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL);
  const stallUrl = parseOwnedUrl(env.BG_EXTRACTION_QA_ADAPTER_STALL_URL);
  const secret = env.BG_EXTRACTION_QA_ADAPTER_SECRET;
  const resources = env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS?.split(",").map(parseOwnedUrl);
  if (sourceUrl === null || stallUrl === null || secret === undefined || secret.length < 32 || resources === undefined) return null;
  if (sourceUrl.origin !== stallUrl.origin || resources.some((url) => url === null || url.origin !== sourceUrl.origin)) return null;
  const resourceUrls = new Set(resources.map((url) => url?.toString() ?? ""));
  if (!resourceUrls.has(sourceUrl.toString()) || !resourceUrls.has(stallUrl.toString())) return null;
  return { sourceUrl, stallUrl, resourceUrls, secret };
}

export function isOwnedQaAdapterEntryUrl(url: URL, config: QaAdapterConfiguration | null = qaAdapterConfiguration()): boolean {
  return config !== null && (url.toString() === config.sourceUrl.toString() || url.toString() === config.stallUrl.toString());
}

export function isOwnedQaAdapterResourceUrl(url: URL, config: QaAdapterConfiguration | null = qaAdapterConfiguration()): boolean {
  return config !== null && config.resourceUrls.has(url.toString());
}

export function qaAdapterRequestHeaders(url: URL, config: QaAdapterConfiguration | null = qaAdapterConfiguration()): Readonly<Record<string, string>> {
  return config !== null && isOwnedQaAdapterResourceUrl(url, config) ? { [SECRET_HEADER]: config.secret } : {};
}

function parseOwnedUrl(value: string | undefined): URL | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "" ||
      url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
    ) return null;
    return url;
  } catch {
    return null;
  }
}
