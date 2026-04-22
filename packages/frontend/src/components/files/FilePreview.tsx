import type { FileInfo } from "@bg/shared";

export default function FilePreview({ file }: { file: FileInfo | null }) {
  if (!file) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-8">
        Select a file to preview.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="px-4 py-2 border-b border-border shrink-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {file.category}
        </div>
        <div className="text-sm font-mono truncate">{file.rel_path}</div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {file.category === "asset" ? (
          <PlaceholderImage name={file.rel_path} />
        ) : (
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
{`// Phase 1 placeholder
// File content ships with BE-S4-05 (file content route).
//
// rel_path:   ${file.rel_path}
// category:   ${file.category}
// size_bytes: ${file.size_bytes ?? "—"}
// updated_at: ${file.updated_at ?? "—"}
`}
          </pre>
        )}
      </div>
    </div>
  );
}

function PlaceholderImage({ name }: { name: string }) {
  return (
    <div className="aspect-video grid place-items-center bg-muted border border-border rounded-md text-muted-foreground text-sm">
      {name} — image preview arrives in Sprint 4
    </div>
  );
}
