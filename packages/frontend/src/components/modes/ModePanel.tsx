import type { CanvasMode } from "./types";
import type { SelectedNode } from "@/types/project";
import SelectorReadOnlyPanel from "./SelectorReadOnlyPanel";

/**
 * Right-side mode pane. Renders nothing when no mode is active so the canvas
 * uses the full width; the iframe is then directly interactive (copy text,
 * click links, right-click, etc.).
 */
export default function ModePanel({
  mode,
  selection,
}: {
  mode: CanvasMode | null;
  selection: SelectedNode | null;
}) {
  if (!mode) return null;

  return (
    <aside className="w-[320px] shrink-0 border-l border-border bg-background flex flex-col min-h-0">
      {mode === "select" && <SelectorReadOnlyPanel selection={selection} />}
      {mode === "tweaks" && (
        <EmptyPanel
          title="Tweaks"
          body="Direct CSS inspector ships in Phase 3. The Phase 1 read-only selector is the foundation."
        />
      )}
      {mode === "comment" && (
        <EmptyPanel
          title="Comment"
          body="Anchor-based comments ship in Phase 2."
        />
      )}
      {mode === "edit" && (
        <EmptyPanel
          title="Edit"
          body="Inline content editing ships in Phase 2."
        />
      )}
      {mode === "draw" && (
        <EmptyPanel
          title="Draw"
          body="Overlay sketching ships in Phase 3."
        />
      )}
    </aside>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
