import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PermissionRequest {
  toolCallId: string;
  tool: string;
  input: unknown;
}

/**
 * Modal surfaced when a `tool.permission_required` event arrives.
 * Allow/Deny dispatch `user.tool_decision`; Deny aborts the active
 * turn server-side so the CLI exits cleanly.
 */
export default function PermissionDialog({
  request,
  pending,
  onDecide,
}: {
  request: PermissionRequest | null;
  pending: boolean;
  onDecide: (decision: "allow" | "deny") => void;
}) {
  const open = request !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending && request) onDecide("deny");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-md bg-amber-500/10 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <DialogTitle>이 도구 실행을 허용할까요?</DialogTitle>
          <DialogDescription>
            CLI가 도구를 실행할 권한을 요청했어요. 내용을 확인하고 계속할지
            정해 주세요. 거부하면 이번 턴이 중단돼요.
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="rounded-md border border-border bg-muted/40 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                도구
              </span>
              <span className="truncate font-mono">{request.tool}</span>
            </div>
            <div className="border-b border-border px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                입력
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {formatInput(request.input)}
              </pre>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                호출 ID
              </span>
              <span className="truncate font-mono text-muted-foreground">
                {request.toolCallId}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onDecide("deny")}
            disabled={pending}
          >
            거부하고 중단
          </Button>
          <Button
            variant="default"
            onClick={() => onDecide("allow")}
            disabled={pending}
          >
            {pending ? "보내는 중…" : "허용"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatInput(input: unknown): string {
  if (input == null) return "(입력 없음)";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
