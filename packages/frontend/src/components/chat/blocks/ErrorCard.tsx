import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorCard({
  message,
  recoverable,
}: {
  message: string;
  recoverable: boolean;
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-destructive">Error</div>
          <div className="text-destructive/80 mt-0.5 break-words">
            {message}
          </div>
          {recoverable && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1">
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
              <Button size="sm" variant="ghost" className="h-7">
                Report
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
