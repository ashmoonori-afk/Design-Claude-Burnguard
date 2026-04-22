import { RefreshCw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/components/modes/types";
import { Button } from "@/components/ui/button";

const MODES: Array<{ id: CanvasMode; label: string; phase?: number }> = [
  { id: "select", label: "Select" },
  { id: "tweaks", label: "Tweaks", phase: 3 },
  { id: "comment", label: "Comment" },
  { id: "edit", label: "Edit" },
  { id: "draw", label: "Draw", phase: 3 },
];

export default function CanvasTopBar({
  mode,
  onModeChange,
  onRefresh,
}: {
  mode: CanvasMode | null;
  onModeChange: (m: CanvasMode | null) => void;
  onRefresh: () => void;
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
        <button
          className="inline-flex items-center gap-1 px-2 h-7 rounded text-xs text-muted-foreground hover:text-foreground"
          title="Zoom"
        >
          75%
          <ChevronDown className="h-3 w-3" />
        </button>
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
