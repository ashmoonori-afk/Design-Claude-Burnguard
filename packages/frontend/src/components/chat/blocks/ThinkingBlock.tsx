import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";

export default function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Sparkles className="h-3 w-3" />
        Thinking
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l border-border italic whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}
