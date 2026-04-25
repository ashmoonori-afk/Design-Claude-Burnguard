import { useEffect, useRef, useState } from "react";
import { Import, Paperclip, Send, Settings2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IDLE_PLACEHOLDER =
  "뭘 만들고 싶나요? 로컬 CLI라 응답은 조금 느려요...";

// Local CLIs take a few seconds to get going. Rotating the placeholder
// while the turn is running turns the wait into a tiny loop of "the
// app is alive" signals instead of a blank disabled textarea.
const WAITING_PLACEHOLDERS = [
  "로컬 CLI 워밍업 중... ☕",
  "Claude가 키보드를 두드리는 중...",
  "토큰을 한 장 한 장 세는 중... 📜",
  "GPU가 기어를 올리는 소리가 들려요...",
  "deck에 잉크를 바르는 중... 🎨",
  "프롬프트를 천천히 음미하는 중...",
  "로컬이라 좀 느립니다. 딴짓해도 돼요.",
  "당신의 문장을 조립 중... 🧱",
  "Claude가 스크롤을 읽는 중... 📚",
  "그림의 남은 한 조각을 찾는 중...",
];
const WAITING_INTERVAL_MS = 2400;

export default function Composer({
  onSend,
  disabled = false,
  canInterrupt = false,
  interruptPending = false,
  onInterrupt,
  initialText = "",
}: {
  onSend: (text: string, files: File[]) => void;
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
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [waitingIndex, setWaitingIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Rotate the placeholder every few seconds while the CLI is busy.
  // Random start so the same message doesn't greet every turn.
  useEffect(() => {
    if (!disabled) return;
    setWaitingIndex(Math.floor(Math.random() * WAITING_PLACEHOLDERS.length));
    const id = window.setInterval(() => {
      setWaitingIndex((prev) => (prev + 1) % WAITING_PLACEHOLDERS.length);
    }, WAITING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [disabled]);

  const placeholder = disabled
    ? (WAITING_PLACEHOLDERS[waitingIndex] ?? IDLE_PLACEHOLDER)
    : IDLE_PLACEHOLDER;

  const canSend = text.trim().length > 0 && !disabled;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped]);
  }

  function send() {
    if (!canSend) return;
    onSend(text, files);
    setText("");
    setFiles([]);
  }

  return (
    <div
      className={cn(
        "border-t border-border p-3 bg-background",
        dragOver && "ring-2 ring-accent ring-inset",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-muted text-muted-foreground text-[11px] px-2 py-1"
            >
              📎 <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setFiles((prev) => prev.filter((_, j) => j !== i))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex items-center gap-1 mt-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Settings"
          disabled={disabled}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Attach files"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          title="Import a folder"
          disabled={disabled}
        >
          <Import className="h-3.5 w-3.5" /> Import
        </Button>
        <div className="flex-1" />
        {disabled && canInterrupt ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={interruptPending || !onInterrupt}
            onClick={() => onInterrupt?.()}
            title="Interrupt the running turn"
          >
            <StopCircle className="h-3.5 w-3.5" />
            {interruptPending ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <Button
            variant="cta"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!canSend}
            onClick={send}
            title="Send (Cmd/Ctrl+Enter)"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
        Drop files, docs, or Figma links to attach.
      </p>
    </div>
  );
}
