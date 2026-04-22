export type NormalizedEvent =
  | { id: string; ts: number; type: "chat.delta"; turnId: string; text: string }
  | {
      id: string;
      ts: number;
      type: "chat.thinking";
      turnId: string;
      text: string;
    }
  | { id: string; ts: number; type: "chat.message_end"; turnId: string }
  | {
      id: string;
      ts: number;
      type: "tool.started";
      turnId: string;
      toolCallId: string;
      tool: string;
      input: unknown;
    }
  | {
      id: string;
      ts: number;
      type: "tool.finished";
      turnId: string;
      toolCallId: string;
      tool: string;
      ok: boolean;
      output?: unknown;
    }
  | {
      id: string;
      ts: number;
      type: "tool.permission_required";
      turnId: string;
      toolCallId: string;
      tool: string;
      input: unknown;
    }
  | {
      id: string;
      ts: number;
      type: "file.changed";
      turnId: string;
      action: "created" | "edited" | "deleted";
      path: string;
    }
  | { id: string; ts: number; type: "status.running" }
  | {
      id: string;
      ts: number;
      type: "status.idle";
      stopReason: "end_turn" | "requires_action" | "interrupted" | "error";
    }
  | {
      id: string;
      ts: number;
      type: "status.error";
      message: string;
      recoverable: boolean;
    }
  | {
      id: string;
      ts: number;
      type: "usage.delta";
      input: number;
      output: number;
      cached?: number;
    };

export type UserEvent =
  | { type: "user.message"; text: string; attachments?: string[] }
  | { type: "user.interrupt" }
  | {
      type: "user.tool_decision";
      toolCallId: string;
      decision: "allow" | "deny";
      reason?: string;
    };
