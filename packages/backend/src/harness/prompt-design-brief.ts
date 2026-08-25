import type { DesignBriefV1 } from "@bg/shared";

export function appendDesignBriefContext(
  lines: string[],
  designBrief: DesignBriefV1 | null,
): void {
  if (designBrief === null) return;
  lines.push("<burnguard-design-brief-v1>");
  lines.push(JSON.stringify(designBrief));
  lines.push("</burnguard-design-brief-v1>");
  lines.push("");
}
