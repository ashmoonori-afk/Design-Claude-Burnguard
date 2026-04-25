import { RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/components/modes/types";
import { Button } from "@/components/ui/button";

const MODES: Array<{ id: CanvasMode; label: string; phase?: number }> = [
  { id: "select", label: "Select" },
  { id: "tweaks", label: "Tweaks" },
  { id: "comment", label: "Comment" },
  { id: "edit", label: "Edit" },
  { id: "draw", label: "Draw" },
];

export default function CanvasTopBar({
  mode,
  onModeChange,
  onRefresh,
  canUndo = false,
  undoPending = false,
  onUndo,
}: {
  mode: CanvasMode | null;
  onModeChange: (m: CanvasMode | null) => void;
  onRefresh: () => void;
  /**
   * Whether the active file has a single-step undo entry available.
   * Audit fix #7: shows after any GUI patch (Edit / Tweaks save)
   * and clears once the undo runs or the next patch overwrites it.
   */
  canUndo?: boolean;
  undoPending?: boolean;
  onUndo?: () => void;
}) {
  return (
    <div className="h-10 border-b border-border bg-background flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-0.5">
        {MODES.map((m) => {
          const disabled = Boolean(m.phase);
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() =>
                !disabled && onModeChange(active ? null : m.id)
              }
              disabled={disabled}
              title={
                disabled
                  ? `Phase ${m.phase}`
                  : active
                    ? "Click again to deactivate"
                    : undefined
              }
              className={cn(
                "px-2.5 h-7 rounded text-xs transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onUndo}
          disabled={!canUndo || undoPending || !onUndo}
          title={
            canUndo
              ? "Undo last save (Edit / Tweaks)"
              : "No GUI patch to undo on the active file"
          }
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          title="Refresh canvas"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
