import type { DesignSystemSummary } from "@bg/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function SystemHeader({ system }: { system: DesignSystemSummary }) {
  return (
    <header className="border-b border-border bg-background px-8 py-4 flex items-center gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Design system
        </div>
        <h1 className="text-lg font-semibold truncate">{system.name}</h1>
      </div>
      <Badge
        variant={system.status === "published" ? "accent" : "outline"}
        className="uppercase tracking-wider"
      >
        {system.status}
      </Badge>
      {system.is_template && <Badge variant="outline">Template</Badge>}
      {system.status === "review" && (
        <Button variant="cta" size="sm">
          Publish
        </Button>
      )}
    </header>
  );
}
