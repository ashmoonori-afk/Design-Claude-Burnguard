import { useMemo } from "react";
import type { NormalizedEvent, SessionInfo } from "@bg/shared";
import AgentMessage from "./blocks/AgentMessage";
import ThinkingBlock from "./blocks/ThinkingBlock";
import ToolBadge from "./blocks/ToolBadge";
import FileRefCard from "./blocks/FileRefCard";
import ErrorCard from "./blocks/ErrorCard";
import UsageFooter from "./blocks/UsageFooter";
import UserMessage from "./blocks/UserMessage";

export default function MessageStream({
  events,
  session,
  onOpenFile,
  onRevertTurn,
  revertingTurnId,
}: {
  events: NormalizedEvent[];
  session: SessionInfo;
  onOpenFile?: (relPath: string) => void;
  onRevertTurn?: (turnId: string) => void;
  revertingTurnId?: string | null;
}) {
  const groups = useMemo(() => buildGroups(events), [events]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3 relative">
      {groups.map((g, i) => {
        switch (g.kind) {
          case "user":
            return (
              <UserMessage
                key={g.ev.id}
                text={g.ev.text}
                attachmentCount={g.ev.attachmentCount}
                turnId={g.ev.turnId}
                onRevert={onRevertTurn}
                reverting={revertingTurnId === g.ev.turnId}
              />
            );
          case "message":
            return <AgentMessage key={`msg-${i}`} text={g.text} />;
          case "thinking":
            return <ThinkingBlock key={g.ev.id} text={g.ev.text} />;
          case "tool":
            return (
              <ToolBadge
                key={g.started.id}
                tool={g.started.tool}
                state={
                  g.finished
                    ? g.finished.ok
                      ? "finished"
                      : "error"
                    : "running"
                }
              />
            );
          case "file":
            return (
              <FileRefCard
                key={g.ev.id}
                path={g.ev.path}
                action={g.ev.action}
                onClick={
                  onOpenFile ? () => onOpenFile(g.ev.path) : undefined
                }
              />
            );
          case "error":
            return (
              <ErrorCard
                key={g.ev.id}
                message={g.ev.message}
                recoverable={g.ev.recoverable}
              />
            );
        }
      })}
      <UsageFooter usage={session.usage} />
    </div>
  );
}

type UserMessageEv = Extract<NormalizedEvent, { type: "chat.user_message" }>;
type ToolStarted = Extract<NormalizedEvent, { type: "tool.started" }>;
type ToolFinished = Extract<NormalizedEvent, { type: "tool.finished" }>;
type ThinkingEv = Extract<NormalizedEvent, { type: "chat.thinking" }>;
type FileChangeEv = Extract<NormalizedEvent, { type: "file.changed" }>;
type ErrorEv = Extract<NormalizedEvent, { type: "status.error" }>;

type Group =
  | { kind: "user"; ev: UserMessageEv }
  | { kind: "message"; text: string }
  | { kind: "thinking"; ev: ThinkingEv }
  | { kind: "tool"; started: ToolStarted; finished: ToolFinished | null }
  | { kind: "file"; ev: FileChangeEv }
  | { kind: "error"; ev: ErrorEv };

function buildGroups(events: NormalizedEvent[]): Group[] {
  const finishedById = new Map<string, ToolFinished>();
  for (const ev of events) {
    if (ev.type === "tool.finished") finishedById.set(ev.toolCallId, ev);
  }

  const groups: Group[] = [];
  let textBuf = "";
  const flushText = () => {
    if (textBuf) {
      groups.push({ kind: "message", text: textBuf });
      textBuf = "";
    }
  };

  for (const ev of events) {
    switch (ev.type) {
      case "chat.user_message":
        flushText();
        groups.push({ kind: "user", ev });
        break;
      case "chat.delta":
        textBuf += ev.text;
        break;
      case "chat.message_end":
        flushText();
        break;
      case "chat.thinking":
        flushText();
        groups.push({ kind: "thinking", ev });
        break;
      case "tool.started":
        flushText();
        groups.push({
          kind: "tool",
          started: ev,
          finished: finishedById.get(ev.toolCallId) ?? null,
        });
        break;
      case "status.error":
        flushText();
        groups.push({ kind: "error", ev });
        break;
      default:
        // tolerated: tool.finished, tool.permission_required, status.*,
        // usage.*, file.changed. file.changed still fires in the backend
        // so ProjectView can refresh the iframe + re-index, but we no
        // longer render it as a chat block — every Tweaks / Edit PATCH
        // produced a "deck.html" line that spammed the stream without
        // adding user value.
        break;
    }
  }
  flushText();
  return groups;
}
