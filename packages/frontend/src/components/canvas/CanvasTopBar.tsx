import { RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasMode } from "@/components/modes/types";
import { Button } from "@/components/ui/button";

const MODES: Array<{ id: CanvasMode; label: string; phase?: number }> = [
  { id: "select", label: "선택" },
  { id: "tweaks", label: "스타일" },
  { id: "comment", label: "코멘트" },
  { id: "edit", label: "편집" },
  { id: "draw", label: "그리기" },
  { id: "quality", label: "품질 점검" },
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
    <div className="h-10 border-b border-border bg-background flex items-center justify-between px-3 shrink-0 max-[900px]:h-auto max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:px-2">
      <div className="flex items-center gap-0.5 max-[900px]:grid max-[900px]:grid-cols-3">
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
              aria-pressed={active}
              title={
                disabled
                  ? `${m.phase}단계`
                  : active
                    ? "다시 누르면 모드 끄기"
                    : undefined
              }
              className={cn(
                "px-2.5 h-7 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[900px]:h-11 max-[900px]:min-w-0 max-[900px]:overflow-hidden max-[900px]:text-ellipsis max-[900px]:whitespace-nowrap max-[900px]:px-1 max-[900px]:text-[10px]",
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

      <div className="flex items-center gap-1 max-[900px]:self-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 max-[900px]:h-11 max-[900px]:w-11"
          onClick={onUndo}
          disabled={!canUndo || undoPending || !onUndo}
          title={
            canUndo
              ? "마지막 저장 실행 취소 (편집 / 스타일)"
              : "현재 파일에서 실행 취소할 수정이 없어요"
          }
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 max-[900px]:h-11 max-[900px]:w-11"
          onClick={onRefresh}
          title="캔버스 새로고침"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
