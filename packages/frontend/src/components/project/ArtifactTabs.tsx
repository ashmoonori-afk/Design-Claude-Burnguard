import { X, FileCode, Palette, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactTab } from "@/types/project";

export default function ArtifactTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
}: {
  tabs: ArtifactTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}) {
  return (
    <div className="flex items-stretch h-full px-2">
      {tabs.map((t) => {
        const Icon =
          t.kind === "design_system"
            ? Palette
            : t.kind === "design_files"
              ? Folder
              : FileCode;
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "group h-full px-3 flex items-center gap-2 text-xs border-b-2 transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[180px] truncate">{t.title}</span>
            {t.closeable && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(t.id);
                }}
                className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
