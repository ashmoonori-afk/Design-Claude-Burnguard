import { useEffect, useState } from "react";
import type { Comment } from "@bg/shared";
import { cn } from "@/lib/utils";

export default function CommentPanel({
  comments,
  activeRelPath,
  activeSlideIdx,
  focusedId,
  onFocus,
  onUpdateBody,
  onToggleResolved,
}: {
  comments: Comment[];
  activeRelPath: string | null;
  activeSlideIdx: number | null;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  onUpdateBody: (id: string, body: string) => void;
  onToggleResolved: (id: string, resolved: boolean) => void;
}) {
  const visible = activeRelPath
    ? comments.filter((c) => {
        if (c.rel_path !== activeRelPath) return false;
        if (c.resolved_at !== null) return false;
        if (activeSlideIdx != null) {
          const pinSlide = c.slide_index ?? 0;
          if (pinSlide !== activeSlideIdx) return false;
        }
        return true;
      })
    : [];

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Comments
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Click on the canvas to drop a pin. Each pin is anchored to a
          percentage position on the active file.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {visible.length === 0 && (
          <p className="px-1 pt-2 text-xs text-muted-foreground">
            {activeRelPath
              ? activeSlideIdx != null
                ? "No open comments on this slide yet."
                : "No open comments on this file yet."
              : "Open a file in the canvas to comment."}
          </p>
        )}

        {visible.map((comment, idx) => (
          <CommentItem
            key={comment.id}
            index={idx + 1}
            comment={comment}
            focused={comment.id === focusedId}
            onFocus={() =>
              onFocus(comment.id === focusedId ? null : comment.id)
            }
            onUpdateBody={(body) => onUpdateBody(comment.id, body)}
            onToggleResolved={() =>
              onToggleResolved(comment.id, comment.resolved_at === null)
            }
          />
        ))}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  index,
  focused,
  onFocus,
  onUpdateBody,
  onToggleResolved,
}: {
  comment: Comment;
  index: number;
  focused: boolean;
  onFocus: () => void;
  onUpdateBody: (body: string) => void;
  onToggleResolved: () => void;
}) {
  const [draft, setDraft] = useState(comment.body);
  const resolved = comment.resolved_at !== null;

  // Sync local draft whenever the server-side body changes and the user isn't
  // actively editing (cheap heuristic: only when not focused).
  useEffect(() => {
    if (!focused) setDraft(comment.body);
  }, [comment.body, focused]);

  const commitIfDirty = () => {
    if (draft !== comment.body) onUpdateBody(draft);
  };

  return (
    <div
      className={cn(
        "rounded-md border text-xs bg-background",
        focused ? "border-orange-400" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left"
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
            resolved
              ? "bg-muted text-muted-foreground"
              : "bg-orange-500 text-white",
          )}
        >
          {index}
        </span>
        <span className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
          {comment.node_selector || "body"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {resolved ? "resolved" : "open"}
        </span>
      </button>

      <div className="p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitIfDirty}
          placeholder="Add a note..."
          rows={2}
          className="w-full resize-none rounded border border-border bg-background p-1.5 text-xs"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {new Date(comment.created_at).toLocaleString()}
          </span>
          <button
            type="button"
            onClick={onToggleResolved}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {resolved ? "Reopen" : "Resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}
