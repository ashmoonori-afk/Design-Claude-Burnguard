import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UserMessage({
  text,
  attachmentCount,
  turnId,
  onRevert,
  reverting,
}: {
  text: string;
  attachmentCount?: number;
  turnId?: string;
  onRevert?: (turnId: string) => void;
  reverting?: boolean;
}) {
  const canRevert = Boolean(turnId && onRevert);
  return (
    <div className="group relative flex justify-end">
      <div className="max-w-[85%] rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
        {text}
        {attachmentCount && attachmentCount > 0 ? (
          <div className="mt-1 text-[10px] text-muted-foreground">
            📎 {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
      {canRevert && (
        <button
          type="button"
          onClick={() => {
            if (!turnId || !onRevert || reverting) return;
            const ok = window.confirm(
              "Revert to the state before this turn? Files changed since then will be lost.",
            );
            if (ok) onRevert(turnId);
          }}
          disabled={reverting}
          title="Revert to the state before this turn"
          className={cn(
            "absolute -left-6 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity",
            "group-hover:opacity-100 hover:text-foreground",
            reverting && "opacity-100 animate-pulse",
          )}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="sr-only">Revert this turn</span>
        </button>
      )}
    </div>
  );
}
