import type { NormalizedEvent, UserEvent } from "./events";

export interface LLMBackend {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: BackendCapabilities;
  detect(): Promise<DetectionResult>;
  createSession(config: SessionConfig): Promise<Session>;
}

export interface BackendCapabilities {
  streaming: true;
  interruption: boolean;
  multimodalInput: boolean;
  toolConfirmation: boolean;
  ptyMode: boolean;
  contextInjection: boolean;
  resumeBySessionId: boolean;
}

export interface DetectionResult {
  found: boolean;
  version?: string;
  binaryPath?: string;
  installHint?: string;
}

export interface SessionConfig {
  sessionId: string;
  projectDir: string;
  designSystemDir?: string;
  historyLimit?: number;
  onToolRequest?: (r: ToolRequest) => Promise<ToolDecision>;
}

export interface Session {
  readonly id: string;
  readonly backendId: string;
  status: SessionStatus;
  send(event: UserEvent): Promise<void>;
  interrupt(): Promise<void>;
  subscribe(listener: (e: NormalizedEvent) => void): () => void;
  inject(patch: ContextPatch): void;
  checkpoint(): Promise<CheckpointRef>;
  close(): Promise<void>;
}

export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_tool"
  | "error"
  | "terminated";

export interface FileInfo {
  rel_path: string;
  category:
    | "stylesheet"
    | "script"
    | "document"
    | "asset"
    | "folder"
    | "html"
    | "other";
  size_bytes?: number | null;
  updated_at?: number;
}

export interface TweakDiff {
  file_path: string;
  node_id: string;
  prop: string;
  value: string;
}

export interface ContextPatch {
  designSystem?: { id: string; dirPath: string };
  fileTree?: FileInfo[];
  tweaks?: TweakDiff[];
  conversationSummary?: string;
}

export interface ToolRequest {
  toolCallId: string;
  tool: string;
  input: unknown;
  sensitivity: "low" | "medium" | "high";
}

export interface ToolDecision {
  decision: "allow" | "deny";
  reason?: string;
}

export interface CheckpointRef {
  turnId: string;
  path: string;
  createdAt: number;
}
