import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { getProjectDetail } from "../db/project-read-repository";
import { projectsDir, resolveManagedPath } from "../lib/paths";
import { PathBoundaryError, resolveWithin } from "../security/path-boundary";
import { parsePng, PngValidationError } from "./export-png-validation";

export const THUMBNAIL_WIDTH = 640;
export const THUMBNAIL_HEIGHT = 360;

/** Bumping this invalidates every cached thumbnail without touching artifacts. */
const RENDERER_VERSION = 1;

// Thumbnails live under `.meta`, the only project-owned sidecar root that the
// canonical tree manifest, the watcher and the file index all exclude. Writing
// them at the project root would change the artifact digest that keys them.
const CACHE_SEGMENTS = [".meta", "thumbnails"] as const;

export type ThumbnailRenderRequest = {
  readonly stagedDir: string;
  readonly entrypoint: string;
  readonly outputPath: string;
  readonly deck: boolean;
  readonly signal: AbortSignal;
};

export type ThumbnailRenderer = (request: ThumbnailRenderRequest) => Promise<void>;

export type ThumbnailIdentitySource = {
  readonly id: string;
  readonly current_revision: number;
  readonly current_digest: string | null;
};

export type ThumbnailOutcome =
  | { readonly kind: "ready"; readonly bytes: Uint8Array<ArrayBuffer>; readonly etag: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable"; readonly code: "artifact_unavailable" | "thumbnail_unavailable" };

/** Cache identity: project + artifact revision + artifact digest + renderer version. */
export function projectThumbnailIdentity(project: ThumbnailIdentitySource): string | null {
  if (project.current_digest === null) return null;
  return createHash("sha256")
    .update(`burnguard-thumbnail\n${RENDERER_VERSION}\n${project.id}\n${project.current_revision}\n${project.current_digest}`)
    .digest("hex");
}

/** The read URL for a project thumbnail, or null while the project has no artifact digest. */
export function projectThumbnailUrl(project: ThumbnailIdentitySource): string | null {
  const identity = projectThumbnailIdentity(project);
  if (identity === null) return null;
  return `/api/projects/${encodeURIComponent(project.id)}/thumbnail?v=${identity}`;
}

export async function loadProjectThumbnail(
  projectId: string,
  render: ThumbnailRenderer = renderThumbnailWithChromium,
  temporaryId: () => string = randomUUID,
): Promise<ThumbnailOutcome> {
  const project = await getProjectDetail(projectId);
  if (project === null) return { kind: "not_found" };

  const identity = projectThumbnailIdentity(project);
  if (identity === null) return { kind: "unavailable", code: "artifact_unavailable" };

  // The DB thumbnail_path is never trusted as a filesystem path: the cache
  // location is derived from the managed projects root and the identity hash.
  let projectDir: string;
  let cachePath: string;
  try {
    projectDir = resolveManagedPath(projectsDir, project.dir_path);
    cachePath = resolveWithin(projectDir, ...CACHE_SEGMENTS, `${identity}.png`);
  } catch (error) {
    if (error instanceof PathBoundaryError) return { kind: "unavailable", code: "thumbnail_unavailable" };
    throw error;
  }

  const cached = await readThumbnailFile(cachePath);
  if (cached !== null) return { kind: "ready", bytes: cached, etag: `"${identity}"` };

  const rendered = await renderThumbnailFile({
    request: {
      stagedDir: projectDir,
      entrypoint: project.entrypoint,
      outputPath: cachePath,
      deck: project.type === "slide_deck",
      signal: new AbortController().signal,
    },
    render,
    temporaryId,
  });
  if (rendered === null) return { kind: "unavailable", code: "thumbnail_unavailable" };
  return { kind: "ready", bytes: rendered, etag: `"${identity}"` };
}

/** Renders into a sibling temporary file and publishes it with an atomic rename. */
async function renderThumbnailFile(input: {
  readonly request: ThumbnailRenderRequest;
  readonly render: ThumbnailRenderer;
  readonly temporaryId: () => string;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const cachePath = input.request.outputPath;
  const temporaryPath = `${cachePath}.${process.pid}.${input.temporaryId()}.tmp`;
  try {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await input.render({ ...input.request, outputPath: temporaryPath });
    const bytes = await readThumbnailFile(temporaryPath);
    if (bytes === null) return null;
    await rename(temporaryPath, cachePath);
    return bytes;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/** Returns the PNG bytes only when the file exists and carries the exact expected image. */
async function readThumbnailFile(filePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(await readFile(filePath));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  try {
    const header = parsePng(bytes);
    return header.width === THUMBNAIL_WIDTH && header.height === THUMBNAIL_HEIGHT ? bytes : null;
  } catch (error) {
    if (error instanceof PngValidationError) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

// Imported lazily so the project list, which only builds thumbnail URLs, never
// pulls playwright-core into the process.
async function renderThumbnailWithChromium(request: ThumbnailRenderRequest): Promise<void> {
  const { renderToPng } = await import("./export-png");
  await renderToPng({
    stagedDir: request.stagedDir,
    entrypoint: request.entrypoint,
    outputPath: request.outputPath,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    dpr: 1,
    deck: request.deck,
    signal: request.signal,
  });
}
