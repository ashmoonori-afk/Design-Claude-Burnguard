import { useEffect, useRef, useState } from "react";
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
import {
  buildExportMenuModel,
  buildExportRetryRequest,
} from "./export-options";

const OPTION_ICON: Record<ExportFormat, LucideIcon> = {
  html_zip: FileDown,
  pdf: FileType2,
  png: Download,
  pptx: Presentation,
  handoff: PackagePlus,
};

export type ExportQualityGate = { readonly mustFixCount: number } | null;

export default function ExportMenu({ projectId, projectType, projectOptionsJson, qualityGate, onOpenQuality }: {
  readonly projectId: string;
  readonly projectType: ProjectType;
  readonly projectOptionsJson: string | null;
  readonly qualityGate: ExportQualityGate;
  readonly onOpenQuality: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const openQuality = () => {
    setOpen(false);
    onOpenQuality();
  };

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
      pushToast({ title: "내보내기를 예약했어요", tone: "info" });
    },
    onError: (err) => {
      pushToast({
        title: "내보내기를 시작하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const jobs = jobsQuery.data ?? [];
  const menuModel = buildExportMenuModel(projectType, projectOptionsJson);

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
        const looksLikeChromium = job.error_message?.toLowerCase().includes("chromium");
        const auditFailed = isDesignAuditExportFailure(job);
        pushToast({
          title: `내보내기에 실패했어요 (${formatLabel(job.format)})`,
          body: auditFailed
            ? "내보내기 전 품질 점검에서 고쳐야 할 문제가 발견됐어요."
            : looksLikeChromium
              ? 'Chromium이 설치되어 있지 않아요. 설정 → "내보내기용 Chromium" → 설치를 실행한 뒤 다시 내보내 주세요.'
              : (job.error_message ?? "알 수 없는 오류예요."),
          tone: "error",
        });
      }
    }
  }, [jobs, pushToast, jobsQuery.status]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 focus:ring-2 focus:ring-ring focus:ring-offset-1 max-[900px]:min-h-11 max-[900px]:min-w-11 max-[900px]:justify-center max-[900px]:gap-0 max-[900px]:px-0 max-[900px]:text-[0px]"
          aria-label="내보내기"
        >
          <Download className="h-3.5 w-3.5" /> 내보내기
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-export-menu-content align="end" className="z-[100] w-72">
        <DropdownMenuLabel>내보내기 형식</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {qualityGate !== null && <div className="mx-2 mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2">
          <p className="text-pretty break-keep text-xs text-foreground">고쳐야 할 문제 {qualityGate.mustFixCount}개가 있어 내보내기를 {"시작할\u00A0수\u00A0없어요."}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 h-8 w-full max-[900px]:min-h-11" onClick={openQuality}>품질 점검 열기</Button>
        </div>}
        {!menuModel.ok && (
          <p className="mx-2 rounded-md border border-warning/30 bg-warning/15 p-2 text-pretty break-keep text-xs">
            {menuModel.message}
          </p>
        )}
        {menuModel.options.map((option) => {
          const Icon = OPTION_ICON[option.format];
          const disabled =
            option.disabledReason !== undefined || createMutation.isPending;
          return (
            <DropdownMenuItem
              key={option.key}
              disabled={disabled}
              onClick={(event) => {
                if (disabled) return;
                if (qualityGate !== null) {
                  event.preventDefault();
                  openQuality();
                  return;
                }
                // Keep the dropdown open so the user can watch the status list.
                event.preventDefault();
                createMutation.mutate({
                  format: option.format,
                  options: option.options,
                });
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="flex-1">{option.label}</span>
              {option.disabledReason === "deck_only" && (
                <span className="text-[10px] text-muted-foreground">
                  덱 전용
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        {jobs.some(isDesignAuditExportFailure) && <div className="mx-2 mt-2 rounded-md bg-warning/15 p-2">
          <p className="break-keep text-xs">최근 내보내기가 품질 점검에서 중단됐어요.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 h-8 w-full max-[900px]:min-h-11" onClick={openQuality}>품질 점검 열기</Button>
        </div>}
        {jobs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <ExportStatusList
              jobs={jobs}
              // Standard retries keep using default options — see
              // services/exports.ts. Graphic PNG is the exact-size exception.
              onRetry={(format) => {
                if (qualityGate !== null) { openQuality(); return; }
                const request = buildExportRetryRequest(
                  projectType,
                  format,
                  menuModel,
                );
                if (request !== null) createMutation.mutate(request);
              }}
              retryDisabled={createMutation.isPending}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isDesignAuditExportFailure(job: { readonly error_message: string | null; readonly latest_attempt: { readonly stop_reason: string | null } | null }): boolean {
  return job.latest_attempt?.stop_reason === "validation_failed" && job.error_message?.startsWith("Design audit found ") === true;
}
