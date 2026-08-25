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
  expected_revision?: number;
  expected_artifact_digest?: string;
  expected_file_hash?: string;
  node_bg_id: string;
  node_fingerprint?: string;
  text?: string;
  attributes?: Record<string, string | null>;
  /**
   * Inline-style merge patch. Keys are CSS property names (`font-size`,
   * `background`), values are the new value string. A null value removes
   * that property. Unlisted properties are preserved. When every property
   * is removed, the `style` attribute itself is removed.
   */
  styles?: Record<string, string | null>;
}

export interface PatchFileResponse {
  rel_path: string;
  node_bg_id: string;
  operation_id: string;
  result_revision: number;
  result_digest: string;
  diff: readonly {
    path: string;
    action: "created" | "edited" | "deleted";
    before_hash: string | null;
    after_hash: string | null;
    before_bytes: number;
    after_bytes: number;
  }[];
  updated_at: number;
}
