import {
  Folder,
  FileCode,
  FileText,
  Image as ImageIcon,
  File,
} from "lucide-react";
import type { FileInfo } from "@bg/shared";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: FileInfo["category"][] = [
  "folder",
  "stylesheet",
  "script",
  "html",
  "asset",
  "document",
  "other",
];

const CATEGORY_LABEL: Record<FileInfo["category"], string> = {
  folder: "Folders",
  stylesheet: "Stylesheets",
  script: "Scripts",
  html: "Html",
  asset: "Assets",
  document: "Documents",
  other: "Other",
};

function iconFor(category: FileInfo["category"]) {
  switch (category) {
    case "folder":
      return Folder;
    case "stylesheet":
    case "script":
    case "html":
      return FileCode;
    case "document":
      return FileText;
    case "asset":
      return ImageIcon;
    default:
      return File;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

export default function FileTree({
  files,
  activePath,
  onOpen,
}: {
  files: FileInfo[];
  activePath: string | null;
  onOpen: (file: FileInfo) => void;
}) {
  const byCategory = new Map<FileInfo["category"], FileInfo[]>();
  for (const f of files) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  return (
    <nav className="p-2 space-y-4 text-sm">
      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat);
        if (!list || list.length === 0) return null;
        return (
          <section key={cat}>
            <div className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {CATEGORY_LABEL[cat]}
            </div>
            <ul>
              {list.map((f) => {
                const Icon = iconFor(f.category);
                const active = activePath === f.rel_path;
                return (
                  <li key={f.rel_path}>
                    <button
                      onClick={() => onOpen(f)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-xs transition-colors",
                        active
                          ? "bg-muted text-foreground"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{f.rel_path}</span>
                      {f.size_bytes != null && (
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
                          {formatSize(f.size_bytes)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
