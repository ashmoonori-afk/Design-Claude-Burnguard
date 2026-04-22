import { Link } from "react-router-dom";
import { Home, Share2, Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import type { ProjectDetail } from "@bg/shared";
import ExportMenu from "@/components/export/ExportMenu";

export default function ProjectTopBar({
  project,
  tabsSlot,
}: {
  project: ProjectDetail;
  tabsSlot?: ReactNode;
}) {
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
        <div className="flex items-center gap-2 min-w-0">
          <input
            defaultValue={project.name}
            className="bg-transparent text-sm font-medium focus:outline-none w-[180px] truncate"
          />
          <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto">{tabsSlot}</div>
      <div className="px-3 flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Play className="h-3.5 w-3.5" /> Present
        </Button>
        <ExportMenu projectId={project.id} />
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" /> Share
        </Button>
      </div>
    </header>
  );
}
