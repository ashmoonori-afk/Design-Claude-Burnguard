import type { DesignDirectionState } from "@bg/shared";
import { Compass, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type DirectionStatusBarProps = {
  readonly state: DesignDirectionState | null;
  readonly cancelPending: boolean;
  readonly onOpen: () => void;
  readonly onCancel: () => void;
};

export function DirectionStatusBar({
  state,
  cancelPending,
  onOpen,
  onCancel,
}: DirectionStatusBarProps) {
  const selectedTitle =
    state?.directions.find((direction) => direction.id === state.selected_id)?.title ?? null;
  const loading = state?.status === "loading";
  const currentStatus = statusLabel(state);
  const fullStatus =
    selectedTitle === null ? currentStatus : `${currentStatus} · 선택: ${selectedTitle}`;

  return (
    <div className="shrink-0 border-t border-border bg-muted/60 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 max-[480px]:flex-wrap">
        <Compass className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <p
          className="min-w-0 flex-1 truncate text-xs text-foreground"
          role="status"
          aria-live="polite"
          title={fullStatus}
        >
          <span className="font-medium">{currentStatus}</span>
          {selectedTitle !== null ? (
            <span className="text-muted-foreground"> · 선택: {selectedTitle}</span>
          ) : null}
        </p>
        {loading ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            disabled={cancelPending}
            onClick={onCancel}
          >
            <StopCircle aria-hidden="true" />
            {cancelPending ? "취소 요청 중" : "생성 취소"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0 text-accent"
          onClick={onOpen}
        >
          방향 보기
        </Button>
      </div>
    </div>
  );
}

function statusLabel(state: DesignDirectionState | null): string {
  if (state === null) return "디자인 방향을 아직 만들지 않았어요";
  switch (state.status) {
    case "loading":
      return "디자인 방향을 만들고 있어요";
    case "ready":
      return "디자인 방향 3개가 준비됐어요";
    case "partial":
      return "일부 디자인 방향이 준비됐어요";
    case "failed":
      return "디자인 방향 생성에 실패했어요";
    case "cancelled":
      return "디자인 방향 생성을 취소했어요";
    default: {
      const unreachable: never = state.status;
      return unreachable;
    }
  }
}
