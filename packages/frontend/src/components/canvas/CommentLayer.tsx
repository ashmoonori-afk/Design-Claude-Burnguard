import { useRef, type MouseEvent, type RefObject } from "react";
import type { Comment } from "@bg/shared";
import { cn } from "@/lib/utils";

interface PinInput {
  x_pct: number;
  y_pct: number;
  node_selector: string;
}

export default function CommentLayer({
  active,
  comments,
  activeRelPath,
  iframeRef,
  focusedId,
  onCreate,
  onFocus,
}: {
  active: boolean;
  comments: Comment[];
  activeRelPath: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  focusedId: string | null;
  onCreate: (input: PinInput) => void;
  onFocus: (id: string | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const visible = activeRelPath
    ? comments.filter((c) => c.rel_path === activeRelPath)
    : [];

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) return;
    if (e.target !== overlayRef.current) return; // ignore pin clicks

    const rect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const x_pct = (relX / rect.width) * 100;
    const y_pct = (relY / rect.height) * 100;

    let node_selector = "body";
    const iframeDoc = iframeRef.current?.contentDocument;
    if (iframeDoc) {
      try {
        const el = iframeDoc.elementFromPoint(relX, relY);
        if (el instanceof HTMLElement) {
          const bgId = el.getAttribute("data-bg-node-id");
          if (bgId) node_selector = `[data-bg-node-id="${bgId}"]`;
          else if (el.id) node_selector = `#${el.id}`;
          else node_selector = el.tagName.toLowerCase();
        }
      } catch {
        // cross-origin or not ready — fall back to "body".
      }
    }

    onCreate({ x_pct, y_pct, node_selector });
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
      onClick={handleClick}
    >
      {visible.map((comment, idx) => (
        <CommentPin
          key={comment.id}
          index={idx + 1}
          comment={comment}
          focused={comment.id === focusedId}
          onSelect={() =>
            onFocus(comment.id === focusedId ? null : comment.id)
          }
        />
      ))}
    </div>
  );
}

function CommentPin({
  comment,
  index,
  focused,
  onSelect,
}: {
  comment: Comment;
  index: number;
  focused: boolean;
  onSelect: () => void;
}) {
  const resolved = comment.resolved_at !== null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={comment.body || "(no note)"}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-[10px] font-semibold border shadow-md flex items-center justify-center transition",
        resolved
          ? "bg-muted text-muted-foreground border-border opacity-70"
          : "bg-orange-500 text-white border-white",
        focused && "ring-2 ring-orange-300 scale-110",
      )}
      style={{
        left: `${comment.x_pct}%`,
        top: `${comment.y_pct}%`,
        pointerEvents: "auto",
      }}
    >
      {index}
    </button>
  );
}
