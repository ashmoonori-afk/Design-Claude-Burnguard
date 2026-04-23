import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDesignSystemExtractionResponse,
  DesignSystemDetail,
} from "@bg/shared";
import { useNavigate, useParams } from "react-router-dom";
import { extractDesignSystem, getDesignSystem } from "@/api/design-system";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/state/uiStore";

export default function DesignSystemView({
  systemIdOverride,
}: {
  systemIdOverride?: string;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const { id: paramId } = useParams();
  const id = systemIdOverride ?? paramId;
  const [system, setSystem] = useState<DesignSystemDetail | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<"auto" | "github" | "website">(
    "auto",
  );
  const [draftName, setDraftName] = useState("");
  const [lastImport, setLastImport] =
    useState<CreateDesignSystemExtractionResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    void getDesignSystem(id).then(
      (next) => {
        if (!cancelled) {
          setSystem(next);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  const importMutation = useMutation({
    mutationFn: () =>
      extractDesignSystem({
        source_url: sourceUrl.trim(),
        source_type: sourceType === "auto" ? undefined : sourceType,
        name: draftName.trim() || undefined,
      }),
    onSuccess: async (created) => {
      setImportError(null);
      setLastImport(created);
      setSourceUrl("");
      setDraftName("");
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
      setImportError(message);
      pushToast({
        title: "Import failed",
        body: message,
        tone: "error",
      });
    },
  });

  const canImport =
    sourceUrl.trim().length > 0 && !importMutation.isPending;

  if (!system || !id) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-sm text-muted-foreground">
          Loading design system...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-8">
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design system
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {system.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {system.description ??
                "Bundled local design system. Files are available to sessions as project context."}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              BurnGuard can also scaffold a new draft design system from a git
              repository or a live website. The extractor normalizes the source
              into the same canonical output as the sample: `README.md`,
              `SKILL.md`, `colors_and_type.css`, `preview/`, `ui_kits/`, and
              `uploads/`.
            </p>

            <dl className="mt-8 grid gap-4 text-sm md:grid-cols-2">
              <InfoRow label="Status" value={system.status} />
              <InfoRow
                label="Template"
                value={system.is_template ? "Yes" : "No"}
              />
              <InfoRow label="Source" value={system.source_type ?? "manual"} />
              <InfoRow label="Directory" value={system.dir_path} />
              <InfoRow label="SKILL.md" value={system.skill_md_path ?? "None"} />
              <InfoRow
                label="Tokens CSS"
                value={system.tokens_css_path ?? "None"}
              />
            </dl>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Import design system
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              Create a draft from source
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paste a git repository URL or a website URL. BurnGuard will
              collect tokens, fonts, logos, and representative files, then
              synthesize the canonical design-system folder structure for review.
            </p>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Source URL
                </label>
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://github.com/acme/design-system"
                  disabled={importMutation.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Source type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) =>
                    setSourceType(
                      e.target.value as "auto" | "github" | "website",
                    )
                  }
                  disabled={importMutation.isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="github">Git repository</option>
                  <option value="website">Website</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Draft name
                </label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Optional override"
                  disabled={importMutation.isPending}
                />
              </div>

              <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-6 text-muted-foreground">
                Output shape:
                <div className="mt-2 font-mono text-[11px] text-foreground">
                  README.md
                  <br />
                  SKILL.md
                  <br />
                  colors_and_type.css
                  <br />
                  fonts/ assets/ preview/ ui_kits/ uploads/
                </div>
              </div>

              <Button
                className="w-full"
                variant="cta"
                disabled={!canImport}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? "Importing..." : "Import design system"}
              </Button>

              {importError ? (
                <p className="text-xs text-destructive">{importError}</p>
              ) : null}

              {lastImport ? (
                <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-6">
                  <div className="font-medium text-foreground">
                    Last import: {lastImport.system.name}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {lastImport.extraction.inferred_source_type} ·{" "}
                    {lastImport.extraction.generated_files.length} files generated
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {lastImport.extraction.detected_css_var_count} CSS vars ·{" "}
                    {lastImport.extraction.copied_logo_count} logos
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl">
          <SystemPreviewGrid systemId={id} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 break-all font-mono text-xs text-foreground">
        {value}
      </div>
    </div>
  );
}
