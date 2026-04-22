import { useRef, useState } from "react";
import { Import, Paperclip, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Composer({
  onSend,
}: {
  onSend: (text: string, files: File[]) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const canSend = text.trim().length > 0;

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
        placeholder="Describe what you want to create..."
        rows={3}
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
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Attach files"
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          title="Import a folder"
        >
          <Import className="h-3.5 w-3.5" /> Import
        </Button>
        <div className="flex-1" />
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
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
        Drop files, docs, or Figma links to attach.
      </p>
    </div>
  );
}
