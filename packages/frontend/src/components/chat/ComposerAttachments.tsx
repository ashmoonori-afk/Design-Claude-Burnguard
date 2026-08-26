import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  IntakeItem,
  IntakeRejection,
} from "./attachment-intake";

interface ComposerAttachmentsProps {
  readonly items: readonly IntakeItem[];
  readonly sending: boolean;
  readonly onRemove: (index: number) => void;
}

export default function ComposerAttachments({
  items,
  sending,
  onRemove,
}: ComposerAttachmentsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      className="mb-2 flex flex-wrap gap-1.5"
      aria-label="첨부 목록"
      aria-busy={sending}
      aria-live="polite"
    >
      {items.map((item, index) => (
        <li
          key={`${item.file.name}-${index}`}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]",
            item.status === "ready"
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <Paperclip className="h-3 w-3" aria-hidden="true" />
          <span className="max-w-[120px] truncate">{item.file.name}</span>
          <span className="opacity-90">
            {item.status === "ready"
              ? sending
                ? "보내는 중"
                : "준비됨"
              : rejectionLabel(item.reason)}
          </span>
          <button
            type="button"
            className="ml-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label={`${item.file.name} 첨부 취소`}
            disabled={sending}
            onClick={() => onRemove(index)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function rejectionLabel(reason: IntakeRejection): string {
  switch (reason) {
    case "unsupported_kind":
      return "지원하지 않는 형식";
    case "too_large":
      return "파일당 10MB 초과";
    case "count_exceeded":
      return "최대 8개까지";
    case "total_exceeded":
      return "전체 25MB 초과";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
