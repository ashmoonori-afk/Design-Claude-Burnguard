import { AlertTriangle, ExternalLink } from "lucide-react";
import type { BackendDetectionResult } from "@bg/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CliMissingModal({
  open,
  onOpenChange,
  detection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detection: BackendDetectionResult;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-md bg-destructive/10 text-destructive grid place-items-center mb-3">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>LLM CLI를 찾을 수 없어요</DialogTitle>
          <DialogDescription>
            BurnGuard Design에서 프로젝트를 만들려면 Claude Code 또는 Codex CLI를 설치해야 해요.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {detection.backends.map((b) => {
            const url = b.install_hint?.match(/https?:\/\/\S+/)?.[0];
            return (
              <li key={b.id} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium capitalize">
                    {b.id.replace("-", " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.found ? `설치됨 (${b.version ?? "정상"})` : "찾을 수 없음"}
                  </span>
                </div>
                {!b.found && url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent inline-flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="h-3 w-3" /> 설치 안내
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        <DialogFooter className="pt-2 border-t border-border">
          <Button onClick={() => onOpenChange(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
