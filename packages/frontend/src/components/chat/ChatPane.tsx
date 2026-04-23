import { useState } from "react";
import { MessageSquare, MessageCircleMore } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BackendId, NormalizedEvent, SessionInfo } from "@bg/shared";
import MessageStream from "./MessageStream";
import Composer from "./Composer";
import { switchSessionBackend } from "@/api/session";
import { useUIStore } from "@/state/uiStore";
import { cn } from "@/lib/utils";

type Tab = "chat" | "comments";

export default function ChatPane({
  events,
  session,
  composerDisabled,
  canInterrupt,
  interruptPending,
  onInterrupt,
  onSend,
  onOpenFile,
  onRevertTurn,
  revertingTurnId,
}: {
  events: NormalizedEvent[];
  session: SessionInfo;
  composerDisabled?: boolean;
  canInterrupt?: boolean;
  interruptPending?: boolean;
  onInterrupt?: () => void;
  onSend: (text: string, files: File[]) => void;
  onOpenFile?: (relPath: string) => void;
  onRevertTurn?: (turnId: string) => void;
  revertingTurnId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);

  const switchBackend = useMutation({
    mutationFn: (backendId: BackendId) =>
      switchSessionBackend(session.id, backendId),
    onSuccess: (updated) => {
      queryClient.setQueryData<SessionInfo>(
        ["project", updated.project_id, "session"],
        updated,
      );
    },
    onError: (err) => {
      pushToast({
        title: "Could not switch backend",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const sessionRunning = session.status === "running";

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
        <div className="ml-auto flex items-center gap-1 pb-1 text-[10px]">
          <span className="text-muted-foreground">Backend</span>
          <BackendToggle
            current={session.backend_id}
            disabled={switchBackend.isPending || sessionRunning}
            onSwitch={(next) => switchBackend.mutate(next)}
          />
        </div>
      </div>
      {tab === "chat" ? (
        <>
          <MessageStream
            events={events}
            session={session}
            onOpenFile={onOpenFile}
            onRevertTurn={onRevertTurn}
            revertingTurnId={revertingTurnId}
          />
          <Composer
            onSend={onSend}
            disabled={composerDisabled}
            canInterrupt={canInterrupt}
            interruptPending={interruptPending}
            onInterrupt={onInterrupt}
          />
        </>
      ) : (
        <div className="flex-1 grid place-items-center text-xs text-muted-foreground p-6 text-center">
          Comments land in Phase 2.
        </div>
      )}
    </aside>
  );
}

function BackendToggle({
  current,
  disabled,
  onSwitch,
}: {
  current: BackendId;
  disabled: boolean;
  onSwitch: (next: BackendId) => void;
}) {
  const options: BackendId[] = ["claude-code", "codex"];
  return (
    <div className="flex overflow-hidden rounded border border-border">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => {
            if (disabled || opt === current) return;
            onSwitch(opt);
          }}
          disabled={disabled || opt === current}
          title={
            disabled && opt !== current
              ? "Cannot switch while a turn is running"
              : opt === current
                ? `Active: ${opt}`
                : `Switch to ${opt} on next turn`
          }
          className={cn(
            "px-1.5 py-0.5 font-mono uppercase transition-colors",
            opt === current
              ? "bg-foreground/90 text-background"
              : "bg-background text-muted-foreground hover:text-foreground",
            disabled && opt !== current && "opacity-40 cursor-not-allowed",
          )}
        >
          {opt === "claude-code" ? "cc" : "cx"}
        </button>
      ))}
    </div>
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
