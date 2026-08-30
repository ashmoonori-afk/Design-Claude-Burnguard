import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CatalogDesignSystemDetail, DesignSystemColorToken, DesignSystemDetail } from "@bg/shared";
import { AlertTriangle, Pencil, Plus, Upload } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  getDesignSystemTokens,
  uploadDesignSystemFont,
  upsertDesignSystemColor,
} from "@/api/design-system";
import { catalogDetailRows, getDesignSystem, updateDesignSystemWithConflictReload } from "@/api/design-system-metadata";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/state/uiStore";

type FontRole = "display" | "sans" | "serif" | "mono";

const STATUS_LABELS = {
  draft: "초안",
  review: "검토",
  published: "게시됨",
} as const;

const FONT_ROLE_LABELS = {
  display: "디스플레이",
  sans: "산세리프",
  serif: "세리프",
  mono: "고정폭",
} as const;

const CATALOG_DETAIL_LABELS: Record<string, string> = {
  Status: "상태",
  Template: "템플릿",
  Source: "출처",
  "Source URI": "출처 URI",
  Directory: "디렉터리",
  "Tokens CSS": "토큰 CSS",
  Archived: "보관됨",
};

export default function DesignSystemView({
  systemIdOverride,
}: {
  systemIdOverride?: string;
} = {}) {
  const { id: paramId } = useParams();
  const id = systemIdOverride ?? paramId;
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [system, setSystem] = useState<CatalogDesignSystemDetail | null>(null);
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
      if (!system) throw new Error("missing system");
      const trimmedName = draftName.trim();
      if (!trimmedName) throw new Error("이름을 비워 둘 수 없어요.");
      return await updateDesignSystemWithConflictReload(id, {
        expected_revision: system.metadata_revision,
        name: trimmedName,
        description: draftDescription.trim() ? draftDescription.trim() : null,
        status: draftStatus,
        tags: system.tags,
      });
    },
    onSuccess: async (result) => {
      if (result.kind === "conflict") {
        setSystem(result.current);
        setDraftName(result.current.name);
        setDraftDescription(result.current.description ?? "");
        setDraftStatus(result.current.status);
        pushToast({
          title: "다른 곳에서 디자인 시스템이 변경됐어요",
          body: "현재 메타데이터를 다시 불러왔어요. 검토한 뒤 다시 저장해 주세요.",
          tone: "error",
        });
        return;
      }
      setSystem(result.system);
      setEditing(false);
      pushToast({ title: "디자인 시스템을 업데이트했어요", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["design-systems"] });
    },
    onError: (err) => {
      pushToast({
        title: "디자인 시스템을 업데이트하지 못했어요",
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
      pushToast({ title: "색상 토큰을 저장했어요", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "색상을 저장하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const fontMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("missing id");
      if (!fontFile) throw new Error("먼저 글꼴 파일을 선택해 주세요.");
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
        title: "글꼴을 업로드했어요",
        body: `${font.family}을(를) ${font.rel_path}에 저장했어요`,
        tone: "success",
      });
    },
    onError: (err) => {
      pushToast({
        title: "글꼴을 업로드하지 못했어요",
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
          디자인 시스템을 불러오는 중...
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
              디자인 시스템
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
                세부 정보 편집
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
                  "기본 제공 로컬 디자인 시스템이에요. 파일은 프로젝트 컨텍스트로 세션에 제공돼요."}
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ds-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  이름
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
                  설명
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
                  상태
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
                  <option value="draft">{STATUS_LABELS.draft}</option>
                  <option value="review">{STATUS_LABELS.review}</option>
                  <option value="published">{STATUS_LABELS.published}</option>
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
                  {updateMutation.isPending ? "저장하는 중…" : "변경 사항 저장"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={updateMutation.isPending}
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          {system.status === "draft" ? (
            <DraftValidationCard system={system} notes={extractionNotes} />
          ) : null}

          <dl className="mt-8 grid gap-4 text-sm md:grid-cols-2">
            {catalogDetailRows(system).map((row) => <InfoRow key={row.label} label={CATALOG_DETAIL_LABELS[row.label] ?? row.label} value={row.label === "Status" ? STATUS_LABELS[system.status] : row.label === "Template" ? system.is_template ? "예" : "아니요" : row.value} />)}
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
            글꼴
          </div>
          <h2 className="mt-1 text-base font-semibold">글꼴 업로드</h2>
        </div>
        <Upload className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            글꼴 파일
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
            글꼴 패밀리
          </label>
          <Input
            value={family}
            placeholder="비워 두면 파일 이름에서 추정해요"
            onChange={(e) => onFamilyChange(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            토큰에 할당
          </label>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as FontRole)}
            disabled={saving}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <option value="sans">{FONT_ROLE_LABELS.sans}</option>
            <option value="display">{FONT_ROLE_LABELS.display}</option>
            <option value="serif">{FONT_ROLE_LABELS.serif}</option>
            <option value="mono">{FONT_ROLE_LABELS.mono}</option>
          </select>
        </div>
        <Button
          variant="cta"
          className="w-full"
          onClick={onUpload}
          disabled={saving || !file}
        >
          {saving ? "업로드하는 중..." : "글꼴 업로드"}
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
            색상
          </div>
          <h2 className="mt-1 text-base font-semibold">색상 토큰</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {tokenFilePath ? "colors_and_type.css에서 관리돼요" : "토큰 파일을 찾을 수 없어요"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          색상 추가
        </Button>
      </div>

      {hasDraft ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-xs font-medium">
            {editingToken ? `--${editingToken.name} 편집` : "색상 토큰 추가"}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                토큰 이름
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
                색상 값
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
              {saving ? "저장하는 중..." : "색상 저장"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              취소
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            아직 감지된 색상 토큰이 없어요.
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
                편집
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
              확인 필요
            </Badge>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
              초안 검증
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-foreground">
            이 컴포넌트와 타이포그래피 패턴이 실제 원본과 일치하나요?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            이 초안은 자동으로 만들었어요. 검토할 핵심은 추출된 컴포넌트 패턴, 타이포그래피
            샘플, 미리보기 섹션이 {system.name}의 원본 자료를 충실히 반영하는지예요.
            그렇지 않다면 원본 CSS와 HTML을 다시 살펴보고, 더 잘 맞도록 초안을
            다시 만들어야 해요.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <IssueBox
              label="컴포넌트 확인"
              body="버튼, 카드, 폼, 배지, 표와 그 밖의 미리보기 컴포넌트가 원본 디자인 시스템을 제대로 대표하나요?"
            />
            <IssueBox
              label="타이포그래피 확인"
              body="디스플레이, 제목, 본문 샘플이 추정한 기본값이 아니라 실제 원본의 글꼴 선택, 크기, 굵기, 분위기를 반영하나요?"
            />
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
              아니라면
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">
              검토 또는 게시하기 전에 원본 CSS, HTML, 캡처한 UI 파일을 더 면밀히
              분석하여 추출을 다시 실행하고, 초안이 실제 시스템을 더 정확히
              반영하도록 해 주세요.
            </p>
          </div>

          {notes.length > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
                추출 메모
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
