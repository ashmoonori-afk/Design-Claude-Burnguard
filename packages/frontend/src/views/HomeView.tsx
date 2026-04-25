import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  deleteDesignSystem,
  extractDesignSystem,
  uploadDesignSystem,
} from "@/api/design-system";
import { ApiError } from "@/api/client";
import {
  deleteProject,
  detectBackends,
  listDesignSystems,
  listProjects,
  restoreSamples,
} from "@/api/home";
import CardGrid from "@/components/home/CardGrid";
import {
  projectToCard,
  systemToCard,
  type CardViewModel,
} from "@/components/home/mappers";
import ProjectCard from "@/components/home/ProjectCard";
import DeleteDesignSystemDialog from "@/components/home/DeleteDesignSystemDialog";
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
type SystemImportMode = "url" | "upload";

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
  const [deleteSystemTarget, setDeleteSystemTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSystemBlocker, setDeleteSystemBlocker] = useState<
    | { reason: "is_template" }
    | {
        reason: "has_active_projects";
        projects: Array<{ id: string; name: string }>;
      }
    | null
  >(null);
  const [systemImportOpen, setSystemImportOpen] = useState(false);
  const [systemImportMode, setSystemImportMode] =
    useState<SystemImportMode>("url");
  const [systemSourceUrl, setSystemSourceUrl] = useState("");
  const [systemSourceType, setSystemSourceType] = useState<
    "auto" | "github" | "website" | "figma"
  >("auto");
  const [systemDraftName, setSystemDraftName] = useState("");
  const [systemUploadFile, setSystemUploadFile] = useState<File | null>(null);
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

  const restoreSamplesMutation = useMutation({
    mutationFn: () => restoreSamples(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      pushToast({ title: "Samples restored", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Restore failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const deleteSystemMutation = useMutation({
    mutationFn: (id: string) => deleteDesignSystem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["design-systems"] });
      pushToast({ title: "Design system deleted", tone: "success" });
      setDeleteSystemTarget(null);
      setDeleteSystemBlocker(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as
          | { reason?: string; project_refs?: Array<{ id: string; name: string }> }
          | null
          | undefined;
        if (details?.reason === "is_template") {
          setDeleteSystemBlocker({ reason: "is_template" });
          return;
        }
        if (details?.reason === "has_active_projects") {
          setDeleteSystemBlocker({
            reason: "has_active_projects",
            projects: details.project_refs ?? [],
          });
          return;
        }
      }
      pushToast({
        title: "Delete failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const importSystemMutation = useMutation({
    mutationFn: async () => {
      if (systemImportMode === "upload") {
        if (!systemUploadFile) {
          throw new Error("Choose a .pptx or .pdf file to upload.");
        }
        return await uploadDesignSystem(systemUploadFile, {
          name: systemDraftName.trim() || undefined,
        });
      }

      return await extractDesignSystem({
        source_url: systemSourceUrl.trim(),
        source_type:
          systemSourceType === "auto" ? undefined : systemSourceType,
        name: systemDraftName.trim() || undefined,
      });
    },
    onSuccess: async (created) => {
      setSystemImportError(null);
      setSystemSourceUrl("");
      setSystemDraftName("");
      setSystemUploadFile(null);
      setSystemImportMode("url");
      setSystemImportOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["design-systems"] });
      pushToast({
        title:
          systemImportMode === "upload"
            ? "Design file imported"
            : "Design system imported",
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
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Built-in tutorials, prompt-samples, and template fixtures.
                  Deleting any of them is fine — Restore samples brings the
                  built-in set back.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restoreSamplesMutation.isPending}
                  onClick={() => restoreSamplesMutation.mutate()}
                >
                  {restoreSamplesMutation.isPending
                    ? "Restoring…"
                    : "Restore samples"}
                </Button>
              </div>
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
                importMode={systemImportMode}
                sourceUrl={systemSourceUrl}
                sourceType={systemSourceType}
                draftName={systemDraftName}
                uploadFile={systemUploadFile}
                importError={systemImportError}
                isPending={importSystemMutation.isPending}
                onToggleImport={() => {
                  setSystemImportOpen((prev) => !prev);
                  setSystemImportError(null);
                }}
                onImportModeChange={setSystemImportMode}
                onSourceUrlChange={setSystemSourceUrl}
                onSourceTypeChange={setSystemSourceType}
                onDraftNameChange={setSystemDraftName}
                onUploadFileChange={setSystemUploadFile}
                onImport={() => importSystemMutation.mutate()}
                onSystemDelete={(card) => {
                  setDeleteSystemBlocker(null);
                  setDeleteSystemTarget({ id: card.id, name: card.name });
                }}
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

      <DeleteDesignSystemDialog
        open={deleteSystemTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSystemMutation.isPending) {
            setDeleteSystemTarget(null);
            setDeleteSystemBlocker(null);
          }
        }}
        systemName={deleteSystemTarget?.name ?? ""}
        blocker={deleteSystemBlocker}
        onConfirm={() => {
          if (deleteSystemTarget) {
            deleteSystemMutation.mutate(deleteSystemTarget.id);
          }
        }}
        isPending={deleteSystemMutation.isPending}
      />
    </>
  );
}

function SystemsSection({
  cards,
  importOpen,
  importMode,
  sourceUrl,
  sourceType,
  draftName,
  uploadFile,
  importError,
  isPending,
  onToggleImport,
  onImportModeChange,
  onSourceUrlChange,
  onSourceTypeChange,
  onDraftNameChange,
  onUploadFileChange,
  onImport,
  onSystemDelete,
}: {
  cards: CardViewModel[];
  importOpen: boolean;
  importMode: SystemImportMode;
  sourceUrl: string;
  sourceType: "auto" | "github" | "website" | "figma";
  draftName: string;
  uploadFile: File | null;
  importError: string | null;
  isPending: boolean;
  onToggleImport: () => void;
  onImportModeChange: (value: SystemImportMode) => void;
  onSourceUrlChange: (value: string) => void;
  onSourceTypeChange: (
    value: "auto" | "github" | "website" | "figma",
  ) => void;
  onDraftNameChange: (value: string) => void;
  onUploadFileChange: (value: File | null) => void;
  onImport: () => void;
  onSystemDelete: (card: CardViewModel) => void;
}) {
  // Match the backend MAX_UPLOAD_BYTES guard in design-system-extract.ts
  // so the user sees the size ceiling client-side instead of getting
  // "invalid_upload" back after the multipart round-trip.
  const MAX_UPLOAD_BYTES = 48_000_000;
  const uploadTooLarge =
    importMode === "upload" && uploadFile !== null && uploadFile.size > MAX_UPLOAD_BYTES;
  const canImport =
    importMode === "upload"
      ? uploadFile !== null && !uploadTooLarge && !isPending
      : sourceUrl.trim().length > 0 && !isPending;

  return (
    <div className="space-y-4">
      <div className="max-w-3xl rounded-xl border border-border bg-card/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
        Design systems across draft, review, and published states appear here.
        Use the <span className="font-medium text-foreground">+</span> tile to
        import a new design system from a git repository, website URL, or an
        uploaded `.pptx` / `.pdf`. BurnGuard scaffolds the same canonical
        output shape as the bundled sample, and uploads go through a compact
        Python summarizer so the downstream prompt payload stays token-light.
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
              Git URL, website URL, or PPT/PDF upload
            </div>
          </div>
        </button>

        {cards.map((card) => (
          <ProjectCard
            key={card.id}
            {...card}
            onDelete={() => onSystemDelete(card)}
          />
        ))}
      </CardGrid>

      {importOpen ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium text-foreground">
            Import design system
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            BurnGuard can ingest a repository or live website directly, or
            accept a `.pptx` / `.pdf` upload. Uploaded files go through a
            Python extraction pass that keeps only token-relevant signals and
            compact page summaries before generating the canonical draft bundle.
          </p>

          <div className="mt-4 inline-flex rounded-lg border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => onImportModeChange("url")}
              disabled={isPending}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                importMode === "url"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              URL import
            </button>
            <button
              type="button"
              onClick={() => onImportModeChange("upload")}
              disabled={isPending}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                importMode === "upload"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Upload file
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {importMode === "url" ? (
              <>
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
                        e.target.value as
                          | "auto"
                          | "github"
                          | "website"
                          | "figma",
                      )
                    }
                    disabled={isPending}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="github">Git repository</option>
                    <option value="website">Website</option>
                    <option value="figma">Figma file</option>
                  </select>
                  {sourceType === "figma" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Requires a Figma personal access token. Set it in
                      Settings → Figma access.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Upload file
                  </label>
                  <input
                    type="file"
                    accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    disabled={isPending}
                    onChange={(e) =>
                      onUploadFileChange(e.currentTarget.files?.[0] ?? null)
                    }
                    className="mt-1.5 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent/10 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-accent"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Supported: `.pptx`, `.pdf` · Max 48 MB
                    {uploadFile
                      ? ` · Selected: ${uploadFile.name} (${formatBytes(uploadFile.size)})`
                      : ""}
                  </p>
                  {uploadTooLarge && uploadFile ? (
                    <p className="mt-1 text-xs text-destructive">
                      {uploadFile.name} is {formatBytes(uploadFile.size)} — the
                      backend accepts up to 48 MB. Export a trimmed version or
                      split the deck into multiple uploads.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Python pass:
                  <div className="mt-1 font-mono text-[11px] text-foreground">
                    fonts / colors
                    <br />
                    headings / body
                    <br />
                    page summaries
                    <br />
                    upload-manifest.json
                  </div>
                </div>
              </>
            )}

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
              {isPending
                ? importMode === "upload"
                  ? "Uploading..."
                  : "Importing..."
                : importMode === "upload"
                  ? "Upload design file"
                  : "Import design system"}
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

/**
 * Format a byte count as a human-readable "MB" / "KB" string. Rounds
 * to one decimal place for MB so a 47.3 MB file reads precisely next
 * to the 48 MB ceiling.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mb = bytes / 1_000_000;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1_000;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
}
