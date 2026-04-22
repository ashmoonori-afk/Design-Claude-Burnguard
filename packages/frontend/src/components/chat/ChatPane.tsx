import { useState } from "react";
import { MessageSquare, MessageCircleMore } from "lucide-react";
import type { NormalizedEvent, SessionInfo } from "@bg/shared";
import MessageStream from "./MessageStream";
import Composer from "./Composer";
import { cn } from "@/lib/utils";

type Tab = "chat" | "comments";

export default function ChatPane({
  events,
  session,
  composerDisabled,
  onSend,
  onOpenFile,
}: {
  events: NormalizedEvent[];
  session: SessionInfo;
  composerDisabled?: boolean;
  onSend: (text: string, files: File[]) => void;
  onOpenFile?: (relPath: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <aside className="w-[360px] shrink-0 border-r border-border bg-background flex flex-col min-h-0">
      <div className="flex items-stretch gap-1 px-3 pt-2 border-b border-border">
        <ChatTab
          id="chat"
          active={tab}
          setActive={setTab}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
        >
          Chat
        </ChatTab>
        <ChatTab
          id="comments"
          active={tab}
          setActive={setTab}
          icon={<MessageCircleMore className="h-3.5 w-3.5" />}
        >
          Comments
        </ChatTab>
      </div>
      {tab === "chat" ? (
        <>
          <MessageStream
            events={events}
            session={session}
            onOpenFile={onOpenFile}
          />
          <Composer onSend={onSend} disabled={composerDisabled} />
        </>
      ) : (
        <div className="flex-1 grid place-items-center text-xs text-muted-foreground p-6 text-center">
          Comments land in Phase 2.
        </div>
      )}
    </aside>
  );
}

function ChatTab({
  id,
  active,
  setActive,
  icon,
  children,
}: {
  id: Tab;
  active: Tab;
  setActive: (t: Tab) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => setActive(id)}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
        active === id
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
