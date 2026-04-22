export const APP_NAME = "BurnGuard Design";
export const APP_VERSION = "0.0.1-phase0";

export type BackendId = "claude-code" | "codex";
export type ProjectType =
  | "prototype"
  | "slide_deck"
  | "from_template"
  | "other";
export type DesignSystemStatus = "draft" | "review" | "published";
export type ThemeMode = "light" | "dark" | "auto";

export interface HealthResponse {
  ok: true;
  name: typeof APP_NAME;
  version: typeof APP_VERSION;
  uptimeMs: number;
  runtime: "bun" | "node";
  platform: string;
}
