import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { extractDesignSystem } from "@/api/design-system";
import {
  deleteProject,
  detectBackends,
  listDesignSystems,
  listProjects,
} from "@/api/home";
import CardGrid from "@/components/home/CardGrid";
import {
  projectToCard,
  systemToCard,
  type CardViewModel,
} from "@/components/home/mappers";
import ProjectCard from "@/components/home/ProjectCard";
import DeleteProjectDialog from "@/components/home/DeleteProjectDialog";
import CliMissingModal from "@/components/errors/CliMissingModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useUIStore } from "@/state/uiStore";

type HomeTab = "recent" | "mine" | "examples" | "systems";

export default function HomeView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [activeTab, setActiveTab] = useState<HomeTab>("recent");
  const cliMissingShown = useUIStore((s) => s.cliMissingShown);
  const setCliMissingShown = useUIStore((s) => s.setCliMissingShown);
  const [cliMissingOpen, setCliMissingOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [systemImportOpen, setSystemImportOpen] = useState(false);
  const [systemSourceUrl, setSystemSourceUrl] = useState("");
  const [systemSourceType, setSystemSourceType] = useState<
    "auto" | "github" | "website"
  >("auto");
  const [systemDraftName, setSystemDraftName] = useState("");
  const [systemImportError, setSystemImportError] = useState<string | null>(
    null,
  );

  const recentQuery = useQuery({
    queryKey: ["projects", "recent"],
    queryFn: () => listProjects("recent"),
    enabled: activeTab === "recent",
  });
  const mineQuery = useQuery({
    queryKey: ["projects", "mine"],
    queryFn: () => listProjects("mine"),
    enabled: activeTab === "mine",
  });
  const examplesQuery = useQuery({
    queryKey: ["projects", "examples"],
    queryFn: () => listProjects("examples"),
    enabled: activeTab === "examples",
  });
  const systemsQuery = useQuery({
    queryKey: ["design-systems", "published"],
    queryFn: () => listDesignSystems("published"),
    enabled: activeTab === "systems",
  });
  const detectionQuery = useQuery({
    queryKey: ["backends", "detect"],
    queryFn: detectBackends,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      pushToast({ title: "Project deleted", tone: "success" });
      setDeleteTarget(null);
    },
    onError: (err) => {
      pushToast({
        title: "Delete failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const importSystemMutation = useMutation({
    mutationFn: () =>
      extractDesignSystem({
        source_url: systemSourceUrl.trim(),
        source_type:
          systemSourceType === "auto" ? undefined : systemSourceType,
        name: systemDraftName.trim() || undefined,
      }),
    onSuccess: async (created) => {
      setSystemImportError(null);
      setSystemSourceUrl("");
      setSystemDraftName("");
      setSystemImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["design-systems"] });
      pushToast({
        title: "Design system imported",
        body: `${created.system.name} was created as a draft.`,
        tone: "success",
      });
      navigate(`/systems/${created.system.id}`);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Failed to import design system";
      setSystemImportError(message);
      pushToast({
        title: "Import failed",
        body: message,
        tone: "error",
      });
    },
  });

  useEffect(() => {
    const detection = detectionQuery.data;
    if (!detection || cliMissingShown) {
      return;
    }

    if (detection.backends.every((backend) => !backend.found)) {
      setCliMissingOpen(true);
      setCliMissingShown(true);
    }
  }, [cliMissingShown, detectionQuery.data, setCliMissingShown]);

  const recentCards = (recentQuery.data ?? []).map(projectToCard);
  const mineCards = (mineQuery.data ?? []).map(projectToCard);
  const exampleCards = (examplesQuery.data ?? []).map(projectToCard);
  const systemCards = (systemsQuery.data ?? []).map((system, index) =>
    systemToCard(system, index),
  );

  const onProjectDelete = (card: CardViewModel) =>
    setDeleteTarget({ id: card.id, name: card.name });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as HomeTab)}
          className="flex flex-1 flex-col"
        >
          <div className="flex items-center justify-between gap-4 px-8 pb-4 pt-8">
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="mine">Your designs</TabsTrigger>
              <TabsTrigger value="examples">Examples</TabsTrigger>
              <TabsTrigger value="systems">Design systems</TabsTrigger>
            </TabsList>

            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search" className="pl-8" />
            </div>
          </div>

          <div className="px-8 pb-8">
            <TabsContent value="recent">
              <CardSection
                cards={recentCards}
                emptyText="No recent projects yet."
                onDelete={onProjectDelete}
              />
            </TabsContent>

            <TabsContent value="mine">
              <CardSection
                cards={mineCards}
                emptyText="No personal projects yet."
                onDelete={onProjectDelete}
              />
            </TabsContent>

            <TabsContent value="examples">
              <CardSection
                cards={exampleCards}
                emptyText="No template-based examples yet."
                onDelete={onProjectDelete}
              />
            </TabsContent>

            <TabsContent value="systems">
              <SystemsSection
                cards={systemCards}
                importOpen={systemImportOpen}
                sourceUrl={systemSourceUrl}
                sourceType={systemSourceType}
                draftName={systemDraftName}
                importError={systemImportError}
                isPending={importSystemMutation.isPending}
                onToggleImport={() => {
                  setSystemImportOpen((prev) => !prev);
                  setSystemImportError(null);
                }}
                onSourceUrlChange={setSystemSourceUrl}
                onSourceTypeChange={setSystemSourceType}
                onDraftNameChange={setSystemDraftName}
                onImport={() => importSystemMutation.mutate()}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {detectionQuery.data ? (
        <CliMissingModal
          open={cliMissingOpen}
          onOpenChange={setCliMissingOpen}
          detection={detectionQuery.data}
        />
      ) : null}

      <DeleteProjectDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        projectName={deleteTarget?.name ?? ""}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

function SystemsSection({
  cards,
  importOpen,
  sourceUrl,
  sourceType,
  draftName,
  importError,
  isPending,
  onToggleImport,
  onSourceUrlChange,
  onSourceTypeChange,
  onDraftNameChange,
  onImport,
}: {
  cards: CardViewModel[];
  importOpen: boolean;
  sourceUrl: string;
  sourceType: "auto" | "github" | "website";
  draftName: string;
  importError: string | null;
  isPending: boolean;
  onToggleImport: () => void;
  onSourceUrlChange: (value: string) => void;
  onSourceTypeChange: (value: "auto" | "github" | "website") => void;
  onDraftNameChange: (value: string) => void;
  onImport: () => void;
}) {
  const canImport = sourceUrl.trim().length > 0 && !isPending;

  return (
    <div className="space-y-4">
      <div className="max-w-3xl rounded-xl border border-border bg-card/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
        Published systems appear here. Use the <span className="font-medium text-foreground">+</span>{" "}
        tile to import a new design system from a git repository or website URL.
        BurnGuard will scaffold the same canonical output shape as the bundled sample.
      </div>

      <CardGrid>
        <button
          type="button"
          onClick={onToggleImport}
          className="overflow-hidden rounded-xl border border-dashed border-border bg-card text-left transition-colors hover:border-foreground/40 hover:shadow-app-3"
        >
          <div className="grid h-[120px] place-items-center bg-accent/10 text-accent">
            <div className="grid place-items-center gap-2">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-current/20 bg-white/70">
                <Plus className="h-6 w-6" />
              </div>
              <div className="text-xs font-medium uppercase tracking-[0.16em]">
                Import
              </div>
            </div>
          </div>
          <div className="p-3">
            <div className="text-sm font-medium text-foreground">
              Import design system
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Git URL or website URL to draft
            </div>
          </div>
        </button>

        {cards.map((card) => (
          <ProjectCard key={card.id} {...card} />
        ))}
      </CardGrid>

      {importOpen ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium text-foreground">
            Import design system
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Paste a source URL and BurnGuard will generate a draft design-system
            directory with `README.md`, `SKILL.md`, `colors_and_type.css`,
            `preview/`, `ui_kits/`, and `uploads/`.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Source URL
              </label>
              <Input
                value={sourceUrl}
                onChange={(e) => onSourceUrlChange(e.target.value)}
                placeholder="https://github.com/acme/design-system"
                disabled={isPending}
                className="mt-1.5"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Source type
              </label>
              <select
                value={sourceType}
                onChange={(e) =>
                  onSourceTypeChange(
                    e.target.value as "auto" | "github" | "website",
                  )
                }
                disabled={isPending}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              >
                <option value="auto">Auto-detect</option>
                <option value="github">Git repository</option>
                <option value="website">Website</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Draft name
              </label>
              <Input
                value={draftName}
                onChange={(e) => onDraftNameChange(e.target.value)}
                placeholder="Optional override"
                disabled={isPending}
                className="mt-1.5"
              />
            </div>

            <div className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
              Output:
              <div className="mt-1 font-mono text-[11px] text-foreground">
                README.md
                <br />
                SKILL.md
                <br />
                colors_and_type.css
                <br />
                fonts/ assets/ preview/ ui_kits/ uploads/
              </div>
            </div>
          </div>

          {importError ? (
            <p className="mt-3 text-xs text-destructive">{importError}</p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button variant="cta" disabled={!canImport} onClick={onImport}>
              {isPending ? "Importing..." : "Import design system"}
            </Button>
            <Button variant="outline" disabled={isPending} onClick={onToggleImport}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CardSection({
  cards,
  emptyText,
  onDelete,
}: {
  cards: CardViewModel[];
  emptyText: string;
  onDelete?: (card: CardViewModel) => void;
}) {
  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <CardGrid>
      {cards.map((card) => (
        <ProjectCard
          key={card.id}
          {...card}
          onDelete={onDelete ? () => onDelete(card) : undefined}
        />
      ))}
    </CardGrid>
  );
}
