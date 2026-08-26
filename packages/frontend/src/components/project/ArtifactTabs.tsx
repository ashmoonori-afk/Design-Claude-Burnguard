import { useCallback, useEffect, useRef } from "react";
import { Compass, FileCode, Folder, Palette, X } from "lucide-react";
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const revealActiveTab = useCallback(() => {
    tabRefs.current[activeId]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeId]);

  useEffect(() => {
    revealActiveTab();
  }, [revealActiveTab]);

  return (
    <div
      className="flex h-full w-full min-w-0 items-stretch overflow-x-auto overflow-y-hidden px-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          revealActiveTab();
        }
      }}
    >
      {tabs.map((tab) => {
        const Icon = tabIcon(tab.kind);
        const isActive = tab.id === activeId;
        return (
          <div key={tab.id} className="group flex h-full shrink-0 items-center">
            <button
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={cn(
                "flex h-full items-center gap-2 border-b-2 px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                tab.closeable && "pr-1.5",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[180px] truncate">{tab.title}</span>
            </button>
            {tab.closeable ? (
              <button
                type="button"
                onClick={() => onClose?.(tab.id)}
                className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label={`${tab.title} 탭 닫기`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function tabIcon(kind: ArtifactTab["kind"]) {
  switch (kind) {
    case "design_system":
      return Palette;
    case "design_files":
      return Folder;
    case "directions":
      return Compass;
    case "file":
      return FileCode;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
