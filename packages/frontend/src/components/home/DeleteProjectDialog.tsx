import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function DeleteProjectDialog({
  open,
  onOpenChange,
  projectName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-md bg-destructive/10 text-destructive grid place-items-center mb-3">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="break-keep leading-snug">
            &ldquo;{projectName}&rdquo; 프로젝트를 삭제할까요?
          </DialogTitle>
          <DialogDescription className="break-keep">
            프로젝트와 대화 기록, 첨부 파일, 생성된 파일이 모두 영구 삭제돼요. 되돌릴 수 없어요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "삭제하는 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
