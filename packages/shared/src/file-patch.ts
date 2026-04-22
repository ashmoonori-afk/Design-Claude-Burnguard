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
  updated_at: number;
}
