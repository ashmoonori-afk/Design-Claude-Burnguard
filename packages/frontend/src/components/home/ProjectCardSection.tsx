import { Button } from "@/components/ui/button";
import CardGrid from "./CardGrid";
import type { CardViewModel } from "./mappers";
import ProjectCard from "./ProjectCard";

interface ProjectCardSectionProps {
  readonly cards: readonly CardViewModel[];
  readonly sourceCount: number;
  readonly query: string;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly emptyText: string;
  readonly onRetry: () => void;
  readonly onDelete?: (card: CardViewModel) => void;
}

export default function ProjectCardSection({
  cards,
  sourceCount,
  query,
  isLoading,
  error,
  emptyText,
  onRetry,
  onDelete,
}: ProjectCardSectionProps) {
  if (isLoading) {
    return (
      <div
        aria-live="polite"
        className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground"
      >
        프로젝트를 불러오는 중입니다.
      </div>
    );
  }

  if (error !== null) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center"
      >
        <p className="text-sm text-destructive">
          프로젝트를 불러오지 못했습니다.
        </p>
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (sourceCount === 0) {
    return (
      <div
        aria-live="polite"
        className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground"
      >
        {emptyText}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div
        aria-live="polite"
        className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground"
      >
        ‘{query.trim()}’와 일치하는 프로젝트가 없습니다.
      </div>
    );
  }

  return (
    <CardGrid>
      {cards.map((card) => (
        <ProjectCard
          key={card.id}
          {...card}
          onDelete={onDelete ? () => onDelete(card) : undefined}
        />
      ))}
    </CardGrid>
  );
}
