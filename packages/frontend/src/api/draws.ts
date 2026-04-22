import { apiFetch } from "./client";

const SAFE_LIMIT_BYTES = 2_000_000;

function encode(relPath: string): string {
  return relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function getProjectDraws(
  projectId: string,
  relPath: string,
): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/draws/${encode(relPath)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error(`draws_fetch_failed: ${res.status}`);
  }
  return await res.text();
}

export async function putProjectDraws(
  projectId: string,
  relPath: string,
  svg: string,
): Promise<{ rel_path: string; bytes: number }> {
  if (svg.length > SAFE_LIMIT_BYTES) {
    throw new Error("svg_too_large");
  }
  return apiFetch<{ rel_path: string; bytes: number }>(
    `/api/projects/${projectId}/draws/${encode(relPath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "image/svg+xml" },
      body: svg,
    },
  );
}
