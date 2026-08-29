export type CanvasSourceInput = {
  readonly projectId: string | null;
  readonly activeRelPath: string | null;
  readonly indexedRelPaths: readonly string[] | null;
  readonly entrypointUrl: string | null;
};

export function resolveCanvasSource({
  projectId,
  activeRelPath,
  indexedRelPaths,
  entrypointUrl,
}: CanvasSourceInput): string | null {
  if (projectId !== null && activeRelPath !== null) {
    if (indexedRelPaths?.length === 0) return null;
    return `/api/projects/${projectId}/fs/${encodePath(activeRelPath)}`;
  }
  if (!entrypointUrl || /\/fs\/?$/u.test(entrypointUrl)) return null;
  return entrypointUrl;
}

function encodePath(relPath: string): string {
  return relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
