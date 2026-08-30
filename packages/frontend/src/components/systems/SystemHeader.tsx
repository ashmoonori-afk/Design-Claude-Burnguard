import type { DesignSystemSummary } from "@bg/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS = {
  draft: "초안",
  review: "검토",
  published: "게시됨",
} as const;

export default function SystemHeader({ system }: { system: DesignSystemSummary }) {
  return (
    <header className="border-b border-border bg-background px-8 py-4 flex items-center gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          디자인 시스템
        </div>
        <h1 className="text-lg font-semibold truncate">{system.name}</h1>
      </div>
      <Badge
        variant={system.status === "published" ? "accent" : "outline"}
        className="uppercase tracking-wider"
      >
        {STATUS_LABELS[system.status]}
      </Badge>
      {system.is_template && <Badge variant="outline">템플릿</Badge>}
      {system.status === "review" && (
        <Button variant="cta" size="sm">
          게시
        </Button>
      )}
    </header>
  );
}
