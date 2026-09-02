import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function DeleteDesignSystemDialog({
  open,
  onOpenChange,
  systemName,
  onConfirm,
  isPending,
  blocker,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  onConfirm: () => void;
  isPending?: boolean;
  /**
   * Surfaced when the backend refuses the delete — either because the
   * row is a seeded template or because active projects still point
   * at it. The dialog flips from a confirm prompt into an advisory
   * listing so the user can fix the referencing projects first.
   */
  blocker?:
    | { reason: "is_template" }
    | {
        reason: "has_active_projects";
        projects: Array<{ id: string; name: string }>;
      }
    | null;
}) {
  const hasBlocker = Boolean(blocker);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-md bg-destructive/10 text-destructive grid place-items-center mb-3">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="break-keep leading-snug">
            {hasBlocker
              ? "아직 삭제할 수 없어요"
              : `“${systemName}” 디자인 시스템을 삭제할까요?`}
          </DialogTitle>
          <DialogDescription className="break-keep">
            {hasBlocker
              ? blocker?.reason === "is_template"
                ? "기본으로 제공되는 템플릿 디자인 시스템이라 삭제할 수 없어요."
                : "이 디자인 시스템을 쓰는 프로젝트가 아직 있어요. 아래 프로젝트를 먼저 삭제하거나 이 디자인 시스템을 그대로 두세요."
              : "디자인 시스템 항목과 모든 미리보기 카드, ~/.burnguard/data/systems 아래 표준 폴더가 영구 삭제돼요. 되돌릴 수 없어요."}
          </DialogDescription>
        </DialogHeader>

        {blocker?.reason === "has_active_projects" &&
        blocker.projects.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            {blocker.projects.map((p) => (
              <li key={p.id} className="py-0.5">
                <Link
                  to={`/projects/${p.id}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {hasBlocker ? "닫기" : "취소"}
          </Button>
          {!hasBlocker ? (
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? "삭제하는 중..." : "삭제"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
