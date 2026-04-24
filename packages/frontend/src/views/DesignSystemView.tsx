import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DesignSystemColorToken, DesignSystemDetail } from "@bg/shared";
import { AlertTriangle, Pencil, Plus, Upload } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  getDesignSystem,
  getDesignSystemTokens,
  updateDesignSystem,
  uploadDesignSystemFont,
  upsertDesignSystemColor,
} from "@/api/design-system";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/state/uiStore";

type FontRole = "display" | "sans" | "serif" | "mono";

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
  const [colorTokens, setColorTokens] = useState<DesignSystemColorToken[]>([]);
  const [tokenFilePath, setTokenFilePath] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<DesignSystemColorToken | null>(
    null,
  );
  const [draftColorName, setDraftColorName] = useState("");
  const [draftColorValue, setDraftColorValue] = useState("#000000");
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontFamily, setFontFamily] = useState("");
  const [fontRole, setFontRole] = useState<FontRole>("sans");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const colorEditorRef = useRef<HTMLDivElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

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

  const colorMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("missing id");
      return await upsertDesignSystemColor(id, {
        name: draftColorName.trim(),
        value: draftColorValue.trim(),
      });
    },
    onSuccess: (tokens) => {
      setColorTokens(tokens.colors);
      setTokenFilePath(tokens.token_file_path);
      setEditingColor(null);
      setDraftColorName("");
      setDraftColorValue("#000000");
      setPreviewRefreshKey((key) => key + 1);
      pushToast({ title: "Color token saved", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Could not save color",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const fontMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("missing id");
      if (!fontFile) throw new Error("Choose a font file first.");
      return await uploadDesignSystemFont(id, fontFile, {
        family: fontFamily,
        role: fontRole,
      });
    },
    onSuccess: (font) => {
      setFontFile(null);
      setFontFamily("");
      if (fontInputRef.current) {
        fontInputRef.current.value = "";
      }
      setPreviewRefreshKey((key) => key + 1);
      pushToast({
        title: "Font uploaded",
        body: `${font.family} saved to ${font.rel_path}`,
        tone: "success",
      });
    },
    onError: (err) => {
      pushToast({
        title: "Could not upload font",
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

    void getDesignSystemTokens(id)
      .then((tokens) => {
        if (cancelled) return;
        setColorTokens(tokens.colors);
        setTokenFilePath(tokens.token_file_path);
      })
      .catch(() => {
        if (cancelled) return;
        setColorTokens([]);
        setTokenFilePath(null);
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

          <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <FontUploadCard
              file={fontFile}
              family={fontFamily}
              role={fontRole}
              saving={fontMutation.isPending}
              inputRef={fontInputRef}
              onFileChange={setFontFile}
              onFamilyChange={setFontFamily}
              onRoleChange={setFontRole}
              onUpload={() => fontMutation.mutate()}
            />
            <ColorTokenEditor
              refEl={colorEditorRef}
              tokens={colorTokens}
              tokenFilePath={tokenFilePath}
              editingToken={editingColor}
              name={draftColorName}
              value={draftColorValue}
              saving={colorMutation.isPending}
              onAdd={() => {
                setEditingColor(null);
                setDraftColorName("new-color");
                setDraftColorValue("#000000");
                colorEditorRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              onEdit={(token) => {
                setEditingColor(token);
                setDraftColorName(token.name);
                setDraftColorValue(token.value);
                colorEditorRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              onNameChange={setDraftColorName}
              onValueChange={setDraftColorValue}
              onSave={() => colorMutation.mutate()}
              onCancel={() => {
                setEditingColor(null);
                setDraftColorName("");
                setDraftColorValue("#000000");
              }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl">
          <SystemPreviewGrid
            systemId={id}
            onEditColors={() => {
              colorEditorRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            previewRefreshKey={previewRefreshKey}
          />
        </div>
      </div>
    </div>
  );
}

function FontUploadCard({
  file,
  family,
  role,
  saving,
  inputRef,
  onFileChange,
  onFamilyChange,
  onRoleChange,
  onUpload,
}: {
  file: File | null;
  family: string;
  role: FontRole;
  saving: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onFileChange: (file: File | null) => void;
  onFamilyChange: (value: string) => void;
  onRoleChange: (value: FontRole) => void;
  onUpload: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Fonts
          </div>
          <h2 className="mt-1 text-base font-semibold">Upload font</h2>
        </div>
        <Upload className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Font file
          </label>
          <Input
            ref={inputRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            disabled={saving}
          />
          {file ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {file.name}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Font family
          </label>
          <Input
            value={family}
            placeholder="Leave blank to infer from filename"
            onChange={(e) => onFamilyChange(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Assign to token
          </label>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as FontRole)}
            disabled={saving}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <option value="sans">Sans</option>
            <option value="display">Display</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
        </div>
        <Button
          variant="cta"
          className="w-full"
          onClick={onUpload}
          disabled={saving || !file}
        >
          {saving ? "Uploading..." : "Upload font"}
        </Button>
      </div>
    </section>
  );
}

function ColorTokenEditor({
  refEl,
  tokens,
  tokenFilePath,
  editingToken,
  name,
  value,
  saving,
  onAdd,
  onEdit,
  onNameChange,
  onValueChange,
  onSave,
  onCancel,
}: {
  refEl: RefObject<HTMLDivElement>;
  tokens: DesignSystemColorToken[];
  tokenFilePath: string | null;
  editingToken: DesignSystemColorToken | null;
  name: string;
  value: string;
  saving: boolean;
  onAdd: () => void;
  onEdit: (token: DesignSystemColorToken) => void;
  onNameChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const hasDraft = Boolean(name || editingToken);

  return (
    <section ref={refEl} className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Colors
          </div>
          <h2 className="mt-1 text-base font-semibold">Color tokens</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {tokenFilePath ? "Backed by colors_and_type.css" : "No token file found"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add color
        </Button>
      </div>

      {hasDraft ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-xs font-medium">
            {editingToken ? `Edit --${editingToken.name}` : "Add color token"}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Token name
              </label>
              <Input
                value={name}
                placeholder="primary-blue"
                onChange={(e) => onNameChange(e.target.value)}
                disabled={saving || Boolean(editingToken)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Color value
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={normalizeColorInput(value)}
                  onChange={(e) => onValueChange(e.target.value)}
                  disabled={saving}
                  className="h-9 w-11 shrink-0 rounded-md border border-input bg-background p-1"
                />
                <Input
                  value={value}
                  placeholder="#0057B8"
                  onChange={(e) => onValueChange(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="cta"
              size="sm"
              onClick={onSave}
              disabled={saving || !name.trim() || !value.trim()}
            >
              {saving ? "Saving..." : "Save color"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No color tokens detected yet.
          </div>
        ) : (
          tokens.map((token) => (
            <div
              key={token.name}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <div
                className="h-8 w-8 shrink-0 rounded-md border border-border"
                style={{ background: token.value }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">--{token.name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {token.value}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => onEdit(token)}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function normalizeColorInput(value: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : "#000000";
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
