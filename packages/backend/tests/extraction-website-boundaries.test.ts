import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExtractionAcquisitionError, acquisitionLimits, createAcquisitionBudget } from "../src/services/extraction-acquisition";
import {
  assertAggregateAssetBytes,
  assertAssetCount,
  fetchWebsiteResource,
} from "../src/services/extraction-website";

const userAgent = "BurnGuard/test design-system-import";
const adapterSecret = "service-owned-adapter-secret-000001";

function configureOwnedAdapter(port: number, sourcePath: string, resourcePaths: readonly string[]): () => void {
  const origin = `http://127.0.0.1:${port}`;
  const previous = { source: process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL, stall: process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL, resources: process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS, secret: process.env.BG_EXTRACTION_QA_ADAPTER_SECRET };
  const sourceUrl = `${origin}${sourcePath}`;
  const stallUrl = `${origin}/__stall`;
  process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL = sourceUrl;
  process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL = stallUrl;
  process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS = [...new Set([sourceUrl, stallUrl, ...resourcePaths.map((value) => `${origin}${value}`)])].join(",");
  process.env.BG_EXTRACTION_QA_ADAPTER_SECRET = adapterSecret;
  return () => {
    if (previous.source === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL; else process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL = previous.source;
    if (previous.stall === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL; else process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL = previous.stall;
    if (previous.resources === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS; else process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS = previous.resources;
    if (previous.secret === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_SECRET; else process.env.BG_EXTRACTION_QA_ADAPTER_SECRET = previous.secret;
  };
}

async function awaitBounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("website boundary event deadline exceeded")), 5_000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function withSentinel<T>(operation: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "bg-website-boundary-"));
  const sentinel = path.join(root, "sentinel");
  await writeFile(sentinel, "keep");
  try {
    const result = await operation();
    expect(await readFile(sentinel, "utf8")).toBe("keep");
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("production website acquisition boundaries", () => {
  test("Given redirects beyond the service limit When production fetch runs Then the typed limit rejects and its server closes", async () => {
    // Given
    const server = Bun.serve({ port: 0, fetch: (request) => Response.redirect(new URL("/next", request.url), 302) });
    const limits = acquisitionLimits({ redirects: 1 });
    const restoreAdapter = configureOwnedAdapter(server.port, "/start", ["/next"]);

    try {
      // When
      const failure = withSentinel(() => fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/start`), {
        maxBytes: 100,
        kind: "html",
        noteBytes: () => {},
        signal: new AbortController().signal,
        userAgent,
        limits,
      }));

      // Then
      await expect(failure).rejects.toMatchObject({ limit: "redirects", maximum: 1 });
    } finally {
      restoreAdapter();
      await server.stop(true);
    }
  });

  test("Given a bounded successful body When production fetch consumes it Then bytes and text are returned without mutation", async () => {
    // Given
    const server = Bun.serve({ port: 0, fetch: () => new Response("fixture") });
    let notedBytes = 0;
    const restoreAdapter = configureOwnedAdapter(server.port, "/ok", []);
    try {
      // When
      const result = await withSentinel(() => fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/ok`), {
        maxBytes: 16,
        kind: "html",
        noteBytes: (bytes) => { notedBytes = bytes; },
        signal: new AbortController().signal,
        userAgent,
      }));

      // Then
      expect(result.text).toBe("fixture");
      expect(notedBytes).toBe(7);
    } finally {
      restoreAdapter();
      await server.stop(true);
    }
  });

  test("Given exact service-owned adapter configuration When production fetch runs Then it authenticates only allowlisted resources", async () => {
    // Given
    const secret = "service-owned-adapter-secret-000001";
    let requestCount = 0;
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        requestCount += 1;
        return request.headers.get("x-burnguard-qa-adapter-secret") === secret
          ? new Response("fixture")
          : new Response("forbidden", { status: 403 });
      },
    });
    const sourceUrl = `http://127.0.0.1:${server.port}/source`;
    const stallUrl = `http://127.0.0.1:${server.port}/stall`;
    const previous = {
      source: process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL,
      stall: process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL,
      resources: process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS,
      secret: process.env.BG_EXTRACTION_QA_ADAPTER_SECRET,
    };
    process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL = sourceUrl;
    process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL = stallUrl;
    process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS = `${sourceUrl},${stallUrl}`;
    process.env.BG_EXTRACTION_QA_ADAPTER_SECRET = secret;
    try {
      // When
      const result = await fetchWebsiteResource(new URL(sourceUrl), {
        maxBytes: 16,
        kind: "html",
        noteBytes: () => {},
        signal: new AbortController().signal,
        userAgent,
      });

      // Then
      expect(result.text).toBe("fixture");
      await expect(fetchWebsiteResource(new URL(`${sourceUrl}?token=forged`), {
        maxBytes: 16,
        kind: "html",
        noteBytes: () => {},
        signal: new AbortController().signal,
        userAgent,
      })).rejects.toMatchObject({ code: "invalid_source_url" });
      expect(requestCount).toBe(1);
    } finally {
      if (previous.source === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL;
      else process.env.BG_EXTRACTION_QA_ADAPTER_SOURCE_URL = previous.source;
      if (previous.stall === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL;
      else process.env.BG_EXTRACTION_QA_ADAPTER_STALL_URL = previous.stall;
      if (previous.resources === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS;
      else process.env.BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS = previous.resources;
      if (previous.secret === undefined) delete process.env.BG_EXTRACTION_QA_ADAPTER_SECRET;
      else process.env.BG_EXTRACTION_QA_ADAPTER_SECRET = previous.secret;
      await server.stop(true);
    }
  });

  test("Given a body beyond its HTML byte limit When production fetch streams it Then the typed limit rejects", async () => {
    // Given
    const server = Bun.serve({ port: 0, fetch: () => new Response("12345") });
    const restoreAdapter = configureOwnedAdapter(server.port, "/large", []);
    try {
      // When
      const failure = withSentinel(() => fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/large`), {
        maxBytes: 4,
        kind: "html",
        noteBytes: () => {},
        signal: new AbortController().signal,
        userAgent,
      }));

      // Then
      await expect(failure).rejects.toMatchObject({ limit: "html_bytes", maximum: 4 });
    } finally {
      restoreAdapter();
      await server.stop(true);
    }
  });

  test("Given invalid redirect and HTTP responses When production fetch handles each Then stable typed fetch errors reject", async () => {
    // Given
    const server = Bun.serve({
      port: 0,
      fetch: (request) => new URL(request.url).pathname === "/missing"
        ? new Response(null, { status: 302 })
        : new Response("failed", { status: 500 }),
    });
    const options = {
      maxBytes: 16,
      kind: "html" as const,
      noteBytes: () => {},
      signal: new AbortController().signal,
      userAgent,
    };
    const restoreAdapter = configureOwnedAdapter(server.port, "/missing", ["/failure"]);
    try {
      // When
      const failures = await Promise.allSettled([
        fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/missing`), options),
        fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/failure`), options),
      ]);

      // Then
      expect(failures.every((result) => result.status === "rejected" && result.reason.code === "website_fetch_failed")).toBe(true);
    } finally {
      restoreAdapter();
      await server.stop(true);
    }
  });

  test("Given request cancellation during body streaming When production fetch aborts Then the exact server request aborts without leaking the body", async () => {
    // Given
    let notifyRequest: (() => void) | undefined, notifyAbort: ((state: { readonly aborted: boolean }) => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const requestSeen = new Promise<void>((resolve) => { notifyRequest = resolve; });
    const requestAborted = new Promise<{ readonly aborted: boolean }>((resolve) => { notifyAbort = resolve; });
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        observedSignal = request.signal;
        request.signal.addEventListener("abort", () => notifyAbort?.({ aborted: request.signal.aborted }), { once: true });
        notifyRequest?.();
        return new Response(new ReadableStream({ start: (streamController) => streamController.enqueue(new TextEncoder().encode("partial")) }));
      },
    });
    const restoreAdapter = configureOwnedAdapter(server.port, "/stream", []);
    const controller = new AbortController();
    try {
      const operation = fetchWebsiteResource(new URL(`http://127.0.0.1:${server.port}/stream`), { maxBytes: 100, kind: "html", noteBytes: () => {}, signal: controller.signal, userAgent });
      await awaitBounded(requestSeen);

      // When
      controller.abort(new ExtractionAcquisitionError("acquisition_aborted"));

      // Then
      await expect(operation).rejects.toMatchObject({ code: "acquisition_aborted" });
      expect(await awaitBounded(requestAborted)).toEqual({ aborted: true });
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      restoreAdapter();
      await server.stop(true);
      expect(server.pendingRequests).toBe(0);
    }
  });

  test("Given the production website boundary When its public options are audited Then no test-only local bypass exists", async () => {
    // Given / When
    const source = await readFile(new URL("../src/services/extraction-website.ts", import.meta.url), "utf8");

    // Then
    expect(source).not.toContain(`allowLocal${"ForTest"}`);
  });

  test("Given a reserved invalid hostname When production DNS resolution runs Then failure remains bounded and typed", async () => {
    // Given
    const budget = createAcquisitionBudget(undefined, 1_000);
    try {
      // When
      const failure = fetchWebsiteResource(new URL("https://fixture.invalid/source"), {
        maxBytes: 16,
        kind: "html",
        noteBytes: () => {},
        signal: budget.signal,
        userAgent,
      });

      // Then
      await expect(awaitBounded(failure)).rejects.toBeInstanceOf(Error);
    } finally {
      budget.dispose();
    }
  });

  test("Given unsafe local input and excess assets When production guards run Then each boundary rejects before mutation", async () => {
    // Given
    const limits = acquisitionLimits({ assets: 1, assetBytes: 4 });

    // When
    const unsafe = fetchWebsiteResource(new URL("http://127.0.0.1/private"), {
      maxBytes: 16,
      kind: "html",
      noteBytes: () => {},
      signal: new AbortController().signal,
      userAgent,
    });
    const countFailure = () => assertAssetCount(2, limits);
    const bytesFailure = () => assertAggregateAssetBytes(5, limits);

    // Then
    await expect(unsafe).rejects.toMatchObject({ code: "invalid_source_url" });
    expect(countFailure).toThrow(expect.objectContaining({ limit: "assets", maximum: 1 }));
    expect(bytesFailure).toThrow(expect.objectContaining({ limit: "asset_bytes", maximum: 4 }));
  });
});
