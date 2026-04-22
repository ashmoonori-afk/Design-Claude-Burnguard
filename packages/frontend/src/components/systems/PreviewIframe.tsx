import { useEffect, useState } from "react";

/**
 * Fetches a design-system file from the backend and renders it via `srcDoc`.
 * Expected route: `GET /api/design-systems/:id/files/:path` returning text/html.
 * Falls back to an "unavailable" card when the route is not yet implemented
 * or when the file is missing (BE-S4-05 scope).
 */
export default function PreviewIframe({
  systemId,
  path,
  title,
}: {
  systemId: string;
  path: string;
  title?: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(false);

    fetch(
      `/api/design-systems/${systemId}/files/${path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setContent(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [systemId, path]);

  if (error) {
    return (
      <div className="aspect-video rounded-md bg-muted grid place-items-center text-[10px] font-mono text-muted-foreground text-center p-3">
        <div>
          <div className="truncate max-w-[180px]">{path}</div>
          <div className="mt-1 text-[9px] text-muted-foreground/70">
            preview route pending
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="aspect-video rounded-md bg-muted grid place-items-center text-[10px] font-mono text-muted-foreground">
        loading…
      </div>
    );
  }

  return (
    <iframe
      title={title ?? path}
      srcDoc={content}
      sandbox="allow-same-origin"
      className="aspect-video w-full rounded-md border border-border bg-white"
    />
  );
}
