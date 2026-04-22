import { CheckCircle2, Loader2, XCircle, Clock } from "lucide-react";
import type { ExportJob } from "@/api/export";

export default function ExportStatusList({ jobs }: { jobs: ExportJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1">
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
          return (
            <li key={j.id} className="flex items-center gap-2 px-1 text-xs">
              <Icon
                className={
                  "h-3.5 w-3.5 " +
                  (j.status === "running"
                    ? "animate-spin text-muted-foreground"
                    : j.status === "succeeded"
                      ? "text-accent"
                      : j.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground")
                }
              />
              <span className="flex-1 truncate">{j.format}</span>
              <span className="text-[10px] text-muted-foreground">
                {j.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
