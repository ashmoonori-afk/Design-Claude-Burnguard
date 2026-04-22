import { Pencil, Square, ArrowUpRight, Undo2, Redo2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrawTool } from "@/components/canvas/DrawLayer";

const TOOLS: Array<{ id: DrawTool; label: string; icon: typeof Pencil }> = [
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "rect", label: "Rect", icon: Square },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
];

const COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#111827"];
const WIDTHS = [2, 4, 6];

export default function DrawPanel({
  tool,
  color,
  strokeWidth,
  onChangeTool,
  onChangeColor,
  onChangeWidth,
  onUndo,
  onRedo,
  onClear,
  hasShapes,
}: {
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onChangeTool: (t: DrawTool) => void;
  onChangeColor: (c: string) => void;
  onChangeWidth: (w: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  hasShapes: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Draw
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Sketch annotations over the canvas. Saved per file; excluded
          from the html_zip export.
        </p>
      </div>

      <section className="px-3 py-2 border-b border-border">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          Tool
        </div>
        <div className="grid grid-cols-3 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTool(t.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded border px-2 py-1.5 text-[10px] transition-colors",
                tool === t.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-700"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="px-3 py-2 border-b border-border">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          Color
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeColor(c)}
              title={c}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                color === c ? "border-foreground scale-110" : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </section>

      <section className="px-3 py-2 border-b border-border">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          Stroke
        </div>
        <div className="flex gap-1.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChangeWidth(w)}
              className={cn(
                "flex h-7 w-10 items-center justify-center rounded border text-[10px] transition-colors",
                strokeWidth === w
                  ? "border-foreground bg-muted"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className="inline-block rounded-full bg-foreground"
                style={{ width: w * 2, height: w * 2 }}
              />
            </button>
          ))}
        </div>
      </section>

      <div className="px-3 py-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!hasShapes}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3 w-3" /> Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3 w-3" /> Redo
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasShapes}
          className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear all shapes on this file"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
    </div>
  );
}
