import { useRef, useState } from "react";
import { Paperclip, Send, Settings2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/state/uiStore";
import { cn } from "@/lib/utils";
import ComposerAttachments from "./ComposerAttachments";
import {
  COMPOSER_SUPPORTED_EXTENSIONS,
  planAttachmentIntake,
  readyAttachmentFiles,
  resolveSendOutcome,
  type IntakeItem,
  type SendOutcome,
} from "./attachment-intake";
import { useComposerPlaceholder } from "./useComposerPlaceholder";

type ComposerSendState = { readonly kind: "idle" } | { readonly kind: "processing" } | SendOutcome;

function sendStateMessage(state: ComposerSendState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "processing":
      return "보내는 중이에요. 서버 처리 진행률은 알 수 없어요.";
    case "cancelled":
      return "전송 요청을 취소했어요. 다시 보낼 수 있어요.";
    case "failed":
      return state.code === "unsupported_file_kind"
        ? "지원하지 않는 형식이라 저장하지 않았어요. 해당 파일을 빼고 다시 보내 주세요."
        : "전송에 실패했어요. 다시 보내기를 눌러 주세요.";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

export default function Composer({
  onSend,
  disabled = false,
  canInterrupt = false,
  interruptPending = false,
  onInterrupt,
  initialText = "",
}: {
  /**
   * `signal` aborts the in-flight send request when the caller forwards it to
   * `sendUserEvent`. The composer never assumes it was honoured: it only
   * reports "cancelled" if the returned promise actually rejects with
   * AbortError.
   */
  onSend: (text: string, files: File[], signal: AbortSignal) => void | Promise<void>;
  disabled?: boolean;
  /**
   * True when the current turn has exceeded the user's configured
   * wait threshold and the backend can accept an Interrupt POST.
   * Only surfaces the Stop button when the composer is also
   * disabled — idle composers never show Stop.
   */
  canInterrupt?: boolean;
  interruptPending?: boolean;
  onInterrupt?: () => void;
  /**
   * Optional pre-fill for the textarea on first mount. Used by the
   * "Try this prompt" flow (P4.7e): the project view reads the prompt
   * out of the URL and seeds the composer so the user only has to hit
   * Send. Only the initial value matters — later changes are ignored
   * so a re-render can't clobber what the user has typed.
   */
  initialText?: string;
}) {
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const [text, setText] = useState(initialText);
  const [items, setItems] = useState<readonly IntakeItem[]>([]);
  const [sendState, setSendState] = useState<ComposerSendState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sendAbort = useRef<AbortController | null>(null);
  const placeholder = useComposerPlaceholder(disabled);

  const sending = sendState.kind === "processing";
  const canSend = text.trim().length > 0 && !disabled && !sending;
  const statusMessage = sendStateMessage(sendState);
  const retrying = sendState.kind === "failed" || sendState.kind === "cancelled";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      setItems((prev) => planAttachmentIntake(prev, dropped));
      if (sendState.kind !== "processing") {
        setSendState({ kind: "idle" });
      }
    }
  }

  async function send() {
    if (!canSend) return;
    const controller = new AbortController();
    sendAbort.current = controller;
    setSendState({ kind: "processing" });
    try {
      await onSend(text, [...readyAttachmentFiles(items)], controller.signal);
      setText("");
      setItems([]);
      setSendState({ kind: "idle" });
    } catch (error) {
      // Keep the text and the queue intact so retry costs one click.
      setSendState(resolveSendOutcome(error));
    } finally {
      sendAbort.current = null;
    }
  }

  return (
    <div
      data-qa="composer"
      className={cn(
        "shrink-0 border-t border-border p-3 bg-background",
        dragOver && "ring-2 ring-accent ring-inset",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <ComposerAttachments
        items={items}
        sending={sending}
        onRemove={(index) => {
          setItems((current) =>
            current.filter((_, itemIndex) => itemIndex !== index),
          );
          if (sendState.kind !== "processing") {
            setSendState({ kind: "idle" });
          }
        }}
      />

      {statusMessage !== null && (
        <p
          role="status"
          aria-live="polite"
          className="mb-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          {statusMessage}
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (sendState.kind !== "processing") {
            setSendState({ kind: "idle" });
          }
        }}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex items-center gap-1 mt-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={COMPOSER_SUPPORTED_EXTENSIONS.join(",")}
          aria-label="자료 파일 선택 (PDF, PPTX)"
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) {
              setItems((prev) => planAttachmentIntake(prev, picked));
              if (sendState.kind !== "processing") {
                setSendState({ kind: "idle" });
              }
            }
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground max-[600px]:h-11 max-[600px]:w-11"
          title="설정 열기"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs max-[600px]:h-11"
          title="참고할 파일을 첨부합니다"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" /> 자료 첨부
        </Button>
        <div className="flex-1" />
        {sending ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs max-[600px]:h-11"
            onClick={() => sendAbort.current?.abort()}
            aria-label="전송 취소"
            title="전송 요청을 취소합니다"
          >
            <StopCircle className="h-3.5 w-3.5" aria-hidden="true" /> 전송 취소
          </Button>
        ) : disabled && canInterrupt ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1 text-xs max-[600px]:h-11"
            disabled={interruptPending || !onInterrupt}
            onClick={() => onInterrupt?.()}
            title="진행 중인 작업을 중단합니다"
          >
            <StopCircle className="h-3.5 w-3.5" />
            {interruptPending ? "중단하는 중..." : "중단"}
          </Button>
        ) : (
          <Button
            variant="cta"
            size="sm"
            className="h-7 gap-1 text-xs max-[600px]:h-11"
            disabled={!canSend}
            onClick={() => void send()}
            aria-label={retrying ? "다시 보내기 (Cmd/Ctrl+Enter)" : "보내기 (Cmd/Ctrl+Enter)"}
            title="보내기 (Cmd/Ctrl+Enter)"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />{" "}
            {retrying ? "다시 보내기" : "보내기"}
          </Button>
        )}
      </div>

      <p className="mt-1.5 break-words text-center text-[10px] leading-relaxed text-foreground/80 [word-break:keep-all]">
        PDF와 PPTX를 여기로 끌어다 놓거나 자료 첨부로 올릴 수 있어요. 최대 8개,{" "}
        <span className="whitespace-nowrap">파일당 10MB</span>, 전체 25MB까지예요.
      </p>
    </div>
  );
}
