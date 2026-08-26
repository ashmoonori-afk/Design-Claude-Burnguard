/**
 * Picks the image URL a card should render, or null when the deterministic
 * tint/emoji placeholder must be used instead. A URL that differs from the one
 * that previously failed is retried, so a regenerated thumbnail recovers.
 */
export function resolveThumbnailSource(
  thumbnail: string | null | undefined,
  failedSource: string | null,
): string | null {
  if (!thumbnail) return null;
  return thumbnail === failedSource ? null : thumbnail;
}
