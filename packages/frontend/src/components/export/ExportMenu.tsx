import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { ExportStatus, ProjectType } from "@bg/shared";
import {
  createExport,
  formatLabel,
  listExports,
  type ExportFormat,
  type ExportOptions,
} from "@/api/export";
import { useUIStore } from "@/state/uiStore";
import ExportStatusList from "./ExportStatusList";

interface Option {
  /** Stable React key — also doubles as a click identifier. */
  key: string;
  format: ExportFormat;
  options?: ExportOptions;
  label: string;
  icon: LucideIcon;
  phase?: number;
  /** Restrict the option to specific project types. Empty/undefined = all. */
  onlyForTypes?: ProjectType[];
}

const OPTIONS: Option[] = [
  { key: "html_zip", format: "html_zip", label: "HTML zip", icon: FileDown },
  {
    key: "pdf-a4",
    format: "pdf",
    options: { pdf_paper: "a4" },
    label: "PDF · A4 landscape (deck only)",
    icon: FileType2,
    onlyForTypes: ["slide_deck"],
  },
  {
    key: "pdf-letter",
    format: "pdf",
    options: { pdf_paper: "letter" },
    label: "PDF · Letter landscape (deck only)",
    icon: FileType2,
    onlyForTypes: ["slide_deck"],
  },
  {
    key: "pdf-widescreen",
    format: "pdf",
    options: { pdf_paper: "widescreen-16x9" },
    label: "PDF · 16:9 widescreen (deck only)",
    icon: FileType2,
    onlyForTypes: ["slide_deck"],
  },
  {
    key: "pptx-16x9",
    format: "pptx",
    options: { pptx_size: "16x9" },
    label: "PowerPoint · 16:9 (deck only)",
    icon: Presentation,
    onlyForTypes: ["slide_deck"],
  },
  {
    key: "pptx-4x3",
    format: "pptx",
    options: { pptx_size: "4x3" },
    label: "PowerPoint · 4:3 (deck only)",
    icon: Presentation,
    onlyForTypes: ["slide_deck"],
  },
  { key: "handoff", format: "handoff", label: "Developer handoff (.zip)", icon: PackagePlus },
];

export default function ExportMenu({
  projectId,
  projectType,
}: {
  projectId: string;
  projectType: ProjectType;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);

  // Poll while any job is still pending/running. Once everything settles to
  // succeeded/failed, polling stops and the list stays static until a new
  // export is queued.
  const jobsQuery = useQuery({
    queryKey: ["project", projectId, "exports"],
    queryFn: () => listExports(projectId),
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const hasActive = data.some(
        (j) => j.status === "pending" || j.status === "running",
      );
      return hasActive ? 1000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: { format: ExportFormat; options?: ExportOptions }) =>
      createExport(projectId, input.format, input.options),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project", projectId, "exports"],
      });
      pushToast({ title: "Export queued", tone: "info" });
    },
    onError: (err) => {
      pushToast({
        title: "Export failed to start",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const jobs = jobsQuery.data ?? [];

  // Surface async failures via a toast — the createMutation onError only
  // catches synchronous create-call errors. Background pipeline failures
  // (chromium missing, Playwright crash, etc.) only surface through the
  // poll, and previously sat silently as a "failed" status indicator.
  // Tracks last-seen status per job so a job that was already failed at
  // mount, or that we've already toasted, doesn't fire again on every poll.
  const lastStatusRef = useRef<Map<string, ExportStatus>>(new Map());
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    if (isInitialLoadRef.current) {
      for (const job of jobs) lastStatusRef.current.set(job.id, job.status);
      if (jobs.length > 0 || jobsQuery.status === "success") {
        isInitialLoadRef.current = false;
      }
      return;
    }
    for (const job of jobs) {
      const previous = lastStatusRef.current.get(job.id);
      lastStatusRef.current.set(job.id, job.status);
      if (job.status === "failed" && previous !== "failed") {
        const looksLikeChromium = job.error_message
          ?.toLowerCase()
          .includes("chromium");
        pushToast({
          title: `Export failed (${formatLabel(job.format)})`,
          body: looksLikeChromium
            ? 'Chromium is not installed. Open Settings → "Chromium for exports" → Install, then re-run the export.'
            : (job.error_message ?? "Unknown error."),
          tone: "error",
        });
      }
    }
  }, [jobs, pushToast, jobsQuery.status]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Export as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => {
          const wrongType =
            o.onlyForTypes && !o.onlyForTypes.includes(projectType);
          const disabled =
            Boolean(o.phase) || wrongType || createMutation.isPending;
          return (
            <DropdownMenuItem
              key={o.key}
              disabled={disabled}
              onClick={(event) => {
                if (disabled) return;
                // Keep the dropdown open so the user can watch the status list.
                event.preventDefault();
                createMutation.mutate({ format: o.format, options: o.options });
              }}
            >
              <o.icon className="h-3.5 w-3.5" />
              <span className="flex-1">{o.label}</span>
              {o.phase ? (
                <span className="text-[10px] text-muted-foreground">
                  Phase {o.phase}
                </span>
              ) : wrongType ? (
                <span className="text-[10px] text-muted-foreground">
                  deck only
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {jobs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <ExportStatusList
              jobs={jobs}
              // Retry uses default options — see services/exports.ts
              // comment on enqueueProjectExport. The user can re-pick a
              // specific preset from the menu above if they need it.
              onRetry={(format) => createMutation.mutate({ format })}
              retryDisabled={createMutation.isPending}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
