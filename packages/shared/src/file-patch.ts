/**
 * Single-node HTML patch contract used by Edit mode.
 *
 * The target node is identified solely by its `data-bg-node-id` attribute —
 * BurnGuard's authoring skill requires every edit-surface element to carry
 * this attribute, so callers never need to serialize an arbitrary CSS
 * selector. Only the explicitly-listed fields are written; everything else
 * in the file is preserved verbatim.
 */
export interface PatchFileRequest {
  node_bg_id: string;
  text?: string;
  attributes?: Record<string, string | null>;
}

export interface PatchFileResponse {
  rel_path: string;
  node_bg_id: string;
  updated_at: number;
}
