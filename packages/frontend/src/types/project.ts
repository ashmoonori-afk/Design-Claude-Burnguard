/**
 * Project-domain types. Prefers `@bg/shared` DTOs; keeps UI-only state types
 * that have no backend counterpart.
 */

import type { FileInfo, ProjectDetail, SessionInfo } from "@bg/shared";

// Re-export the shared project/session DTOs for ergonomic frontend imports.
export type { FileInfo, ProjectDetail, SessionInfo } from "@bg/shared";

// Backward-compatible aliases while frontend wiring transitions off local names.
export type ProjectDetailLocal = ProjectDetail;
export type SessionInfoLocal = SessionInfo;

/** UI state only — not a backend concept. */
export interface SelectedNode {
  nodeId: string;
  rect: { x: number; y: number; w: number; h: number };
  computed: Record<string, string>;
  file: string;
}

/** UI state only — describes open canvas tabs. */
export interface ArtifactTab {
  id: string;
  title: string;
  kind: "design_system" | "design_files" | "file";
  relPath?: string;
  closeable: boolean;
}
