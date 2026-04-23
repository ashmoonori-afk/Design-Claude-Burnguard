import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { BackendId, SettingsSummary } from "@bg/shared";
import { Palette } from "lucide-react";
import { getSettings, listDesignSystems } from "@/api/home";
import NewProjectPanel, {
  type ProjectType,
} from "@/components/home/NewProjectPanel";
import { Badge } from "@/components/ui/badge";

const TYPES: Array<{ id: ProjectType; label: string }> = [
  { id: "prototype", label: "Prototype" },
  { id: "slide_deck", label: "Slide deck" },
  { id: "from_template", label: "From template" },
  { id: "other", label: "Other" },
];

const FALLBACK_SETTINGS: SettingsSummary = {
  user: { id: "local", display_name: "You" },
  app_version: "0.3.1",
  default_backend: "claude-code",
  theme: "light",
};

export default function Sidebar() {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState<ProjectType>("slide_deck");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  // Match HomeView's systems tab so a freshly extracted design system
  // (P4.1 creates rows in `draft`) can be picked for a brand-new project.
  // Shares the react-query cache key with HomeView so both views dedupe
  // into a single fetch while the user navigates between them.
  const systemsQuery = useQuery({
    queryKey: ["design-systems", "all"],
    queryFn: async () => {
      const [draft, review, published] = await Promise.all([
        listDesignSystems("draft"),
        listDesignSystems("review"),
        listDesignSystems("published"),
      ]);
      return [...draft, ...review, ...published].sort(
        (a, b) => b.updated_at - a.updated_at,
      );
    },
  });

  const settings = settingsQuery.data ?? FALLBACK_SETTINGS;
  const systems = systemsQuery.data ?? [];

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-background">
      <header className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-accent/15 text-accent">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-none">
              BurnGuard Design
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="h-4 rounded-sm py-0 text-[10px]"
              >
                Local
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                v{settings.app_version}
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav className="flex gap-0.5 border-b border-border px-4">
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
        <NewProjectPanel
          type={activeType}
          designSystems={systems}
          defaultBackend={settings.default_backend as BackendId}
          onCreated={(project) => navigate(`/projects/${project.id}`)}
        />
      </div>

      <footer className="border-t border-border p-4">
        <div className="text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="text-foreground">
            {settings.user.display_name}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3">
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
