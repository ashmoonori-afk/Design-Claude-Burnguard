import { useState } from "react";
import { Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import NewProjectPanel, {
  type ProjectType,
} from "@/components/home/NewProjectPanel";

const TYPES: Array<{ id: ProjectType; label: string }> = [
  { id: "prototype", label: "Prototype" },
  { id: "slide_deck", label: "Slide deck" },
  { id: "from_template", label: "From template" },
  { id: "other", label: "Other" },
];

export default function Sidebar() {
  const [activeType, setActiveType] = useState<ProjectType>("slide_deck");

  return (
    <aside className="w-[360px] shrink-0 border-r border-border bg-background flex flex-col">
      <header className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-accent/15 text-accent grid place-items-center">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-none">
              BurnGuard Design
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge
                variant="outline"
                className="text-[10px] py-0 h-4 rounded-sm"
              >
                Local
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                v0.0.1
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav className="px-4 flex gap-0.5 border-b border-border">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={[
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeType === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        <NewProjectPanel type={activeType} />
      </div>

      <footer className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Signed in as <span className="text-foreground">You</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <a
            href="#"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Docs
          </a>
          <a
            href="/settings"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Settings
          </a>
        </div>
      </footer>
    </aside>
  );
}
