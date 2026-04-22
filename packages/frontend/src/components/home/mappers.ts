import type { DesignSystemSummary, ProjectSummary } from "@bg/shared";
import { formatRelativeDay, projectTypeLabel } from "@/lib/format";

/**
 * View model consumed by the presentational Card component. Independent of
 * the underlying DTO so the card stays stable even if contracts evolve.
 */
export interface CardViewModel {
  id: string;
  name: string;
  subtitle: string;
  href: string;
  tintClass: string;
  emoji?: string;
  thumbnail?: string | null;
  isTemplate?: boolean;
}

const PROJECT_TINTS: Record<string, string> = {
  prototype: "bg-rose-100",
  slide_deck: "bg-slate-100",
  from_template: "bg-blue-100",
  other: "bg-stone-100",
};

const SYSTEM_TINTS = ["bg-amber-100", "bg-sky-100", "bg-emerald-100", "bg-violet-100"];

export function projectToCard(p: ProjectSummary): CardViewModel {
  return {
    id: p.id,
    name: p.name,
    subtitle: `${projectTypeLabel(p.type)} · ${formatRelativeDay(p.updated_at)}`,
    href: `/projects/${p.id}`,
    tintClass: PROJECT_TINTS[p.type] ?? "bg-stone-100",
    thumbnail: p.thumbnail_path,
  };
}

export function systemToCard(s: DesignSystemSummary, index = 0): CardViewModel {
  const statusSuffix =
    s.status === "published" ? "Design system" : `Design system · ${capitalize(s.status)}`;
  return {
    id: s.id,
    name: s.name,
    subtitle: `${statusSuffix} · ${formatRelativeDay(s.updated_at)}`,
    href: `/systems/${s.id}`,
    tintClass: SYSTEM_TINTS[index % SYSTEM_TINTS.length],
    thumbnail: s.thumbnail_path,
    isTemplate: s.is_template,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
