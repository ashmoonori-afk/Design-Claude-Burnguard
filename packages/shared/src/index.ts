/**
 * Shared types used by both backend and frontend.
 *
 * Phase 0: only the bare minimum required to validate the dev loop.
 * Phase 1: NormalizedEvent / UserEvent / LLMBackend interfaces move in here.
 */

export const APP_NAME = "BurnGuard Design";
export const APP_VERSION = "0.0.1-phase0";

export interface HealthResponse {
  ok: true;
  name: typeof APP_NAME;
  version: typeof APP_VERSION;
  uptimeMs: number;
  runtime: "bun" | "node";
  platform: string;
}
