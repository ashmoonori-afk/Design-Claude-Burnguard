import { useMemo } from "react";
import type { NormalizedEvent, SessionInfo } from "@bg/shared";
import AgentMessage from "./blocks/AgentMessage";
import ThinkingBlock from "./blocks/ThinkingBlock";
import ToolBadge from "./blocks/ToolBadge";
import FileRefCard from "./blocks/FileRefCard";
import ErrorCard from "./blocks/ErrorCard";
import UsageFooter from "./blocks/UsageFooter";
import UserMessage from "./blocks/UserMessage";

/**
 * Local-only event used to echo the user's own message into the chat
 * timeline immediately on send. Replaced by a server-emitted event type
 * once BE starts publishing user.message through the broker.
 */
export interface UserMessageLocal {
  id: string;
  ts: number;
  text: string;
  attachmentCount?: number;
}

export default function MessageStream({
  events,
  userMessages,
  session,
  onOpenFile,
}: {
  events: NormalizedEvent[];
  userMessages: UserMessageLocal[];
  session: SessionInfo;
  onOpenFile?: (relPath: string) => void;
}) {
  const groups = useMemo(
    () => buildGroups(events, userMessages),
    [events, userMessages],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3 relative">
      {groups.map((g, i) => {
        switch (g.kind) {
          case "user":
            return (
              <UserMessage
                key={g.msg.id}
                text={g.msg.text}
                attachmentCount={g.msg.attachmentCount}
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

type ToolStarted = Extract<NormalizedEvent, { type: "tool.started" }>;
type ToolFinished = Extract<NormalizedEvent, { type: "tool.finished" }>;
type ThinkingEv = Extract<NormalizedEvent, { type: "chat.thinking" }>;
type FileChangeEv = Extract<NormalizedEvent, { type: "file.changed" }>;
type ErrorEv = Extract<NormalizedEvent, { type: "status.error" }>;

type Group =
  | { kind: "user"; msg: UserMessageLocal }
  | { kind: "message"; text: string }
  | { kind: "thinking"; ev: ThinkingEv }
  | { kind: "tool"; started: ToolStarted; finished: ToolFinished | null }
  | { kind: "file"; ev: FileChangeEv }
  | { kind: "error"; ev: ErrorEv };

type TimelineItem =
  | { kind: "event"; ts: number; data: NormalizedEvent }
  | { kind: "user_local"; ts: number; data: UserMessageLocal };

function buildGroups(
  events: NormalizedEvent[],
  userMessages: UserMessageLocal[],
): Group[] {
  const timeline: TimelineItem[] = [
    ...events.map((e) => ({ kind: "event" as const, ts: e.ts, data: e })),
    ...userMessages.map((u) => ({
      kind: "user_local" as const,
      ts: u.ts,
      data: u,
    })),
  ].sort((a, b) => a.ts - b.ts);

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

  for (const item of timeline) {
    if (item.kind === "user_local") {
      flushText();
      groups.push({ kind: "user", msg: item.data });
      continue;
    }
    const ev = item.data;
    switch (ev.type) {
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
      case "file.changed":
        flushText();
        groups.push({ kind: "file", ev });
        break;
      case "status.error":
        flushText();
        groups.push({ kind: "error", ev });
        break;
      default:
        // tolerated: tool.finished, tool.permission_required, status.*, usage.*
        break;
    }
  }
  flushText();
  return groups;
}
