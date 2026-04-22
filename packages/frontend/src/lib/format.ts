/**
 * UI formatting helpers. No data-source dependencies.
 */

/**
 * Returns a human-friendly relative label like "Today", "Yesterday",
 * or a locale date for anything older. Matches the label convention
 * shown in the Home cards (ref/스크린샷 2026-04-22 093043.png).
 */
export function formatRelativeDay(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs < 0) return "Today";
  if (diffMs < dayMs) return "Today";
  if (diffMs < 2 * dayMs) return "Yesterday";
  if (diffMs < 7 * dayMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days} days ago`;
  }
  return new Date(ts).toLocaleDateString();
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  prototype: "Prototype",
  slide_deck: "Slide deck",
  from_template: "Template",
  other: "Other",
};

export function projectTypeLabel(type: string): string {
  return PROJECT_TYPE_LABEL[type] ?? type;
}
