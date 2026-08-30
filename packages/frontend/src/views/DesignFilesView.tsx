import { useState } from "react";
import type { FileInfo } from "@bg/shared";
import FileTree from "@/components/files/FileTree";
import FilePreview from "@/components/files/FilePreview";
import { mockFileTree } from "@/mocks/project-session";

/**
 * Used both as a route (rarely) and as embedded content within ProjectView's
 * "Design Files" artifact tab. Accepts an optional `files` prop; falls back
 * to fixture when used standalone. Codex swaps the fixture import for
 * `listProjectFiles(projectId)` during wiring.
 */
export default function DesignFilesView({
  files,
  onOpenInCanvas,
}: {
  files?: FileInfo[];
  onOpenInCanvas?: (relPath: string) => void;
}) {
  const fileList = files ?? mockFileTree;
  const [active, setActive] = useState<FileInfo | null>(null);

  return (
    <div className="flex-1 flex min-h-0 flex-col sm:flex-row">
      <div className="h-1/2 w-full shrink-0 overflow-y-auto border-b border-border bg-background sm:h-auto sm:w-[280px] sm:border-b-0 sm:border-r">
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            프로젝트 파일
          </div>
        </div>
        <FileTree
          files={fileList}
          activePath={active?.rel_path ?? null}
          onOpen={(f) => {
            setActive(f);
            if (onOpenInCanvas && (f.category === "html" || f.category === "script")) {
              onOpenInCanvas(f.rel_path);
            }
          }}
        />
      </div>
      <FilePreview file={active} />
    </div>
  );
}
