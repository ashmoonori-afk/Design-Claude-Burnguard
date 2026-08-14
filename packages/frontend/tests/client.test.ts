import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  apiFetch,
  bootstrapApiAuthority,
} from "../src/api/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API authority client", () => {
  test("bootstraps in memory and attaches the capability to API requests", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        if (String(input) === "/api/bootstrap") {
          return Response.json({
            ok: true,
            data: { capability: "launch-token" },
          });
        }
        return Response.json({ ok: true, data: { saved: true } });
      },
    ) as typeof fetch;

    await bootstrapApiAuthority();
    await apiFetch<{ saved: true }>("/api/mutate", { method: "POST" });

    expect(calls).toHaveLength(2);
    const headers = new Headers(calls[1]?.init?.headers);
    expect(headers.get("x-burnguard-capability")).toBe("launch-token");
    expect(calls[0]?.init?.credentials).toBe("same-origin");
    expect(calls[1]?.init?.credentials).toBe("same-origin");
  });

  test("fails closed when bootstrap does not return a capability", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ ok: true, data: {} }),
    ) as typeof fetch;

    await expect(bootstrapApiAuthority()).rejects.toThrow(
      "BurnGuard API authority bootstrap failed.",
    );
  });

  test("cannot reuse a previous capability after bootstrap fails", async () => {
    let bootstrapCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/bootstrap") {
        return Response.json({ ok: true, data: {} });
      }
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) {
        return Response.json({
          ok: true,
          data: { capability: "stale-token" },
        });
      }
      return Response.json(
        { error: { code: "forbidden", message: "denied" } },
        { status: 403 },
      );
    }) as typeof fetch;

    await bootstrapApiAuthority();
    await expect(bootstrapApiAuthority()).rejects.toThrow();
    await expect(apiFetch("/api/private")).rejects.toThrow(
      "BurnGuard API authority is not initialized.",
    );
  });

  test("keeps the capability when callers supply additional headers", async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init ?? {});
        if (String(input) === "/api/bootstrap") {
          return Response.json({
            ok: true,
            data: { capability: "launch-token" },
          });
        }
        return Response.json({ ok: true, data: {} });
      },
    ) as typeof fetch;

    await bootstrapApiAuthority();
    await apiFetch("/api/private", {
      headers: { "x-extra": "kept" },
    });

    const headers = new Headers(calls[1]?.headers);
    expect(headers.get("x-burnguard-capability")).toBe("launch-token");
    expect(headers.get("x-extra")).toBe("kept");
  });
});
