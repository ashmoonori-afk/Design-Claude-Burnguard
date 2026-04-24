import { Link } from "react-router-dom";
import { Home, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import type { ProjectDetail } from "@bg/shared";
import ExportMenu from "@/components/export/ExportMenu";

export default function ProjectTopBar({
  project,
  tabsSlot,
  onPresent,
  canPresent,
}: {
  project: ProjectDetail;
  tabsSlot?: ReactNode;
  onPresent?: () => void;
  canPresent: boolean;
}) {
  const displayName = stripInternalProjectTag(project.name);
  return (
    <header className="h-12 border-b border-border bg-background flex items-stretch shrink-0">
      <div className="flex items-center gap-3 px-4 shrink-0 border-r border-border">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Link>
        <div className="flex items-center min-w-0">
          <div
            className="text-sm font-medium w-[180px] truncate"
            title={displayName}
          >
            {displayName}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto">{tabsSlot}</div>
      <div className="px-3 flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
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
        <ExportMenu projectId={project.id} projectType={project.type} />
      </div>
    </header>
  );
}

function stripInternalProjectTag(name: string): string {
  return name.replace(/^\[burnguard:[^\]]+\]\s*/, "");
}
