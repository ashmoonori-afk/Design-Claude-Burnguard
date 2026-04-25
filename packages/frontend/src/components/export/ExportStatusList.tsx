import { CheckCircle2, Clock, Download, Loader2, XCircle } from "lucide-react";
import { formatLabel, type ExportJob } from "@/api/export";

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExportStatusList({ jobs }: { jobs: ExportJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="px-2 py-1.5">
      <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Recent
      </div>
      <ul className="space-y-1">
        {jobs.slice(0, 5).map((j) => {
          const Icon =
            j.status === "succeeded"
              ? CheckCircle2
              : j.status === "failed"
                ? XCircle
                : j.status === "running"
                  ? Loader2
                  : Clock;
          const iconClass =
            "h-3.5 w-3.5 " +
            (j.status === "running"
              ? "animate-spin text-muted-foreground"
              : j.status === "succeeded"
                ? "text-accent"
                : j.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground");
          const canDownload = j.status === "succeeded";
          return (
            <li
              key={j.id}
              className="flex items-center gap-2 px-1 text-xs"
              title={j.error_message ?? undefined}
            >
              <Icon className={iconClass} />
              <span className="flex-1 truncate">{formatLabel(j.format)}</span>
              {canDownload ? (
                <a
                  href={`/api/exports/${j.id}/download`}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                  // download attribute hints the browser to save instead of
                  // navigate; backend Content-Disposition reinforces it.
                  download
                >
                  <Download className="h-3 w-3" />
                  {formatBytes(j.size_bytes)}
                </a>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {j.status}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
