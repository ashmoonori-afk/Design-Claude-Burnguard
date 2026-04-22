import { useState } from "react";
import {
  Download,
  FileDown,
  FileType2,
  Presentation,
  PackagePlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { createExport, type ExportFormat, type ExportJob } from "@/api/export";
import { useUIStore } from "@/state/uiStore";
import ExportStatusList from "./ExportStatusList";

interface Option {
  id: ExportFormat;
  label: string;
  icon: LucideIcon;
  phase?: number;
}

const OPTIONS: Option[] = [
  { id: "html_zip", label: "HTML zip", icon: FileDown },
  { id: "pdf", label: "PDF", icon: FileType2, phase: 2 },
  { id: "pptx", label: "PowerPoint (.pptx)", icon: Presentation, phase: 2 },
  { id: "handoff", label: "Claude Code handoff", icon: PackagePlus, phase: 3 },
];

export default function ExportMenu({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const pushToast = useUIStore((s) => s.pushToast);

  async function onPick(format: ExportFormat) {
    try {
      const job = await createExport(projectId, format);
      setJobs((prev) => [job, ...prev]);
      pushToast({ title: `Export queued: ${format}`, tone: "info" });
    } catch (err) {
      pushToast({
        title: "Export failed to start",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Export as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.id}
            disabled={Boolean(o.phase)}
            onClick={() => !o.phase && onPick(o.id)}
          >
            <o.icon className="h-3.5 w-3.5" />
            <span className="flex-1">{o.label}</span>
            {o.phase && (
              <span className="text-[10px] text-muted-foreground">
                Phase {o.phase}
              </span>
            )}
          </DropdownMenuItem>
        ))}
        {jobs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <ExportStatusList jobs={jobs} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
