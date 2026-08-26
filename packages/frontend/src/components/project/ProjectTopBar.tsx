import { Link } from "react-router-dom";
import { Home, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import type { ProjectDetail } from "@bg/shared";
import ExportMenu, { type ExportQualityGate } from "@/components/export/ExportMenu";

export default function ProjectTopBar({
  project,
  tabsSlot,
  onPresent,
  canPresent,
  qualityGate,
  onOpenQuality,
}: {
  project: ProjectDetail;
  tabsSlot?: ReactNode;
  onPresent?: () => void;
  canPresent: boolean;
  qualityGate: ExportQualityGate;
  onOpenQuality: () => void;
}) {
  const displayName = stripInternalProjectTag(project.name);
  return (
    <header className="h-12 border-b border-border bg-background flex items-stretch shrink-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 shrink-0 border-r border-border max-[900px]:gap-2 max-[900px]:px-2">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Link>
        <div className="flex items-center min-w-0">
          <div
            className="text-sm font-medium w-[180px] truncate max-[900px]:w-[96px] max-[480px]:w-[72px]"
            title={displayName}
          >
            {displayName}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">{tabsSlot}</div>
      <div className="px-3 flex items-center gap-2 shrink-0 max-[900px]:px-2 max-[900px]:gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 max-[900px]:min-h-11 max-[900px]:min-w-11 max-[900px]:justify-center max-[900px]:gap-0 max-[900px]:px-0 max-[900px]:text-[0px]"
          onClick={onPresent}
          disabled={!canPresent || !onPresent}
          title={
            canPresent
              ? "Start presentation"
              : "Open a deck file in the canvas to present"
          }
        >
          <Play className="h-3.5 w-3.5" /> Present
        </Button>
        <ExportMenu projectId={project.id} projectType={project.type} qualityGate={qualityGate} onOpenQuality={onOpenQuality} />
      </div>
    </header>
  );
}

function stripInternalProjectTag(name: string): string {
  return name.replace(/^\[burnguard:[^\]]+\]\s*/, "");
}
