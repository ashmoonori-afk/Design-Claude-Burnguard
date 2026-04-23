import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DesignSystemDetail } from "@bg/shared";
import { AlertTriangle, Pencil } from "lucide-react";
import { useParams } from "react-router-dom";
import { getDesignSystem, updateDesignSystem } from "@/api/design-system";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/state/uiStore";

export default function DesignSystemView({
  systemIdOverride,
}: {
  systemIdOverride?: string;
} = {}) {
  const { id: paramId } = useParams();
  const id = systemIdOverride ?? paramId;
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [system, setSystem] = useState<DesignSystemDetail | null>(null);
  const [extractionNotes, setExtractionNotes] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftStatus, setDraftStatus] = useState<DesignSystemDetail["status"]>(
    "draft",
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("missing id");
      const trimmedName = draftName.trim();
      if (!trimmedName) throw new Error("Name cannot be empty.");
      return await updateDesignSystem(id, {
        name: trimmedName,
        description: draftDescription.trim() ? draftDescription.trim() : null,
        status: draftStatus,
      });
    },
    onSuccess: async (updated) => {
      setSystem(updated);
      setEditing(false);
      pushToast({ title: "Design system updated", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["design-systems"] });
    },
    onError: (err) => {
      pushToast({
        title: "Could not update design system",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    void getDesignSystem(id).then((next) => {
      if (!cancelled) {
        setSystem(next);
      }
    });

    // Best-effort fetch of the extraction report written by P4.1 / P4.2
    // ingestion. Non-extracted systems (seeded samples) return 404, which
    // we treat as "no notes" without surfacing an error.
    void fetch(`/api/design-systems/${id}/files/uploads/extraction-report.json`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { notes?: unknown };
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        const notes = Array.isArray(payload.notes)
          ? payload.notes.filter((n): n is string => typeof n === "string")
          : [];
        setExtractionNotes(notes);
      })
      .catch(() => {
        // ignore — notes are advisory
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

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
        <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design system
            </div>
            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setDraftName(system.name);
                  setDraftDescription(system.description ?? "");
                  setDraftStatus(system.status);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit details
              </Button>
            ) : null}
          </div>

          {!editing ? (
            <>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {system.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                {system.description ??
                  "Bundled local design system. Files are available to sessions as project context."}
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ds-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Name
                </label>
                <Input
                  id="ds-name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={updateMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="ds-description"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Description
                </label>
                <textarea
                  id="ds-description"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={3}
                  disabled={updateMutation.isPending}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="ds-status"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Status
                </label>
                <select
                  id="ds-status"
                  value={draftStatus}
                  onChange={(e) =>
                    setDraftStatus(
                      e.target.value as DesignSystemDetail["status"],
                    )
                  }
                  disabled={updateMutation.isPending}
                  className="flex h-9 w-full max-w-[200px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                >
                  <option value="draft">Draft</option>
                  <option value="review">Review</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="cta"
                  onClick={() => updateMutation.mutate()}
                  disabled={
                    updateMutation.isPending || !draftName.trim()
                  }
                >
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {system.status === "draft" ? (
            <DraftValidationCard system={system} notes={extractionNotes} />
          ) : null}

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
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl">
          <SystemPreviewGrid systemId={id} />
        </div>
      </div>
    </div>
  );
}

function DraftValidationCard({
  system,
  notes,
}: {
  system: DesignSystemDetail;
  notes: string[];
}) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
              Issue
            </Badge>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
              Draft validation
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-foreground">
            Do these components and typography patterns actually match the source?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This draft was scaffolded automatically. The main review question is
            whether the extracted component patterns, typography samples, and
            preview sections are actually faithful to the source material for{" "}
            {system.name}. If not, the next step should be to dig through the
            source CSS and HTML again and rebuild the draft with better matches.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <IssueBox
              label="Check components"
              body="Are the buttons, cards, forms, badges, tables, and other previewed components actually representative of the source design system?"
            />
            <IssueBox
              label="Check typography"
              body="Do the display, heading, and body samples reflect the real source type choices, scale, weight, and tone rather than guessed defaults?"
            />
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
              If the answer is no
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">
              Re-run extraction with a stronger pass over the source CSS, HTML,
              and captured UI files so the draft reflects the real system more
              accurately before review or publish.
            </p>
          </div>

          {notes.length > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
                Extraction notes
              </div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground">
                {notes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      aria-hidden="true"
                    />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function IssueBox({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{body}</p>
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
