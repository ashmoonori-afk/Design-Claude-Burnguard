import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Comment,
  DesignAuditFinding,
  DesignAuditResult,
  DesignDirectionState,
  FileInfo,
  NormalizedEvent,
  PatchFileRequest,
  PatchFileResponse,
  ProjectDetail,
  SessionInfo,
} from "@bg/shared";
import { parseDesignDirectionState } from "@bg/shared";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getArtifacts,
  getProject,
  getProjectSession,
  listProjectFiles,
  refreshArtifacts,
} from "@/api/project";
import { apiFetch, ApiError } from "@/api/client";
import { getProjectDesignAudit, retryProjectDesignAudit } from "@/api/design-audit";
import { restoreCheckpoint } from "@/api/checkpoints";
import { getFileUndoInfo, patchProjectFile, undoLastFilePatch } from "@/api/files";
import {
  createProjectComment,
  listProjectComments,
  updateProjectComment,
} from "@/api/comments";
import { getSettings } from "@/api/home";
import {
  cancelDesignDirections,
  generateDesignDirections,
  getDesignDirectionState,
  retryDesignDirections,
  selectDesignDirection,
  undoDesignDirectionSelection,
} from "@/api/design-directions";
import {
  interruptSession,
  listSessionEvents,
  sendUserEvent,
  submitToolDecision,
  subscribeSessionStream,
} from "@/api/session";
import ChatPane from "@/components/chat/ChatPane";
import { DirectionsView } from "@/components/directions/DirectionsView";
import { DirectionStatusBar } from "@/components/directions/DirectionStatusBar";
import PermissionDialog, {
  type PermissionRequest,
} from "@/components/chat/PermissionDialog";
import Canvas from "@/components/canvas/Canvas";
import {
  deserializeDraws,
  serializeDraws,
  type DrawLayerHandle,
  type DrawShape,
  type DrawTool,
} from "@/components/canvas/DrawLayer";
import type { EditTarget } from "@/components/canvas/EditLayer";
import type {
  TweaksStyleKey,
  TweaksTarget,
} from "@/components/canvas/TweaksLayer";
import { getProjectDraws, putProjectDraws } from "@/api/draws";
import PresentOverlay from "@/components/present/PresentOverlay";
import ModePanel from "@/components/modes/ModePanel";
import { selectedNodeToTweaksTarget } from "@/components/modes/SelectorReadOnlyPanel";
import { DESIGN_AUDIT_ERROR_COPY } from "@/components/modes/design-audit-copy";
import {
  buildTweakChangePreview,
  type TweakChangePreview,
} from "@/components/modes/TweaksPanel";
import type { CanvasMode } from "@/components/modes/types";
import ArtifactTabs from "@/components/project/ArtifactTabs";
import ProjectTopBar from "@/components/project/ProjectTopBar";
import DesignFilesView from "@/views/DesignFilesView";
import DesignSystemView from "@/views/DesignSystemView";
import { useUIStore } from "@/state/uiStore";
import type { ArtifactTab, SelectedNode } from "@/types/project";
import {
  latestDirectionState,
  preferDirectionState,
} from "@/lib/design-direction-state";
import {
  designAuditErrorCode,
  designAuditViewState,
  groupDesignAuditResult,
  isDesignAuditCurrent,
  preferDesignAuditResult,
} from "@/lib/design-audit-state";

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [sessionState, setSessionState] = useState<SessionInfo | null>(null);

  // Pre-fill from a "Try this prompt" handoff (P4.7e). The home route
  // base64url-encodes the prompt into ?prefill_prompt; we decode it
  // once on mount, hand it to the composer, and strip the param so a
  // refresh doesn't re-prefill on top of whatever the user has typed.
  const [composerPrefill] = useState<string>(() => {
    const raw = searchParams.get("prefill_prompt");
    if (!raw) return "";
    try {
      // base64url → base64 (atob doesn't accept the URL-safe variant)
      // and then decode UTF-8 bytes into a JS string. The padding fix
      // covers prompts whose encoded length is not a multiple of 4.
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (searchParams.has("prefill_prompt")) {
      const next = new URLSearchParams(searchParams);
      next.delete("prefill_prompt");
      setSearchParams(next, { replace: true });
    }
    // Run only on first mount; subsequent param edits should not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeTabId, setActiveTabId] = useState("design-system");
  const [openFileTabs, setOpenFileTabs] = useState<ArtifactTab[]>([]);
  const [mode, setMode] = useState<CanvasMode | null>(null);
  const [selection, setSelection] = useState<SelectedNode | null>(null);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [activeSlideIdx, setActiveSlideIdx] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [tweaksTarget, setTweaksTarget] = useState<TweaksTarget | null>(null);
  const [tweakReview, setTweakReview] = useState<TweakChangePreview | null>(
    null,
  );
  const [auditFocus, setAuditFocus] = useState<{ readonly findingId: string; readonly nodeBgId: string; readonly relPath: string } | null>(null);
  const [auditRevealResult, setAuditRevealResult] = useState<"found" | "not_found" | null>(null);
  const [auditActionError, setAuditActionError] = useState<Error | null>(null);
  const tweaksUndoRef = useRef<TweaksUndoFrame[]>([]);
  const tweaksRedoRef = useRef<TweaksUndoFrame[]>([]);
  const [presentOpen, setPresentOpen] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("pen");
  const [drawColor, setDrawColor] = useState("#EF4444");
  const [drawStrokeWidth, setDrawStrokeWidth] = useState(4);
  const [drawShapes, setDrawShapes] = useState<DrawShape[]>([]);
  const [drawResetKey, setDrawResetKey] = useState("");
  const drawLayerRef = useRef<DrawLayerHandle | null>(null);
  const [decidedToolCallIds, setDecidedToolCallIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [refreshTick, setRefreshTick] = useState(0);
  const [sendPending, setSendPending] = useState(false);
  const [directionActionError, setDirectionActionError] = useState<Error | null>(null);
  const seenEventIdsRef = useRef(new Set<string>());
  const latestEventTsRef = useRef<number | undefined>(undefined);
  const activeTabIdRef = useRef(activeTabId);
  const sendPendingTimeoutRef = useRef<number | null>(null);
  const turnTouchedFilesRef = useRef(false);

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });
  const sessionQuery = useQuery({
    queryKey: ["project", id, "session"],
    queryFn: () => getProjectSession(id!),
    enabled: Boolean(id),
  });
  const filesQuery = useQuery({
    queryKey: ["project", id, "files"],
    queryFn: () => listProjectFiles(id!),
    enabled: Boolean(id),
  });
  const artifactsQuery = useQuery({
    queryKey: ["project", id, "artifacts"],
    queryFn: () => getArtifacts(id!),
    enabled: Boolean(id),
  });
  const designAuditQueryKey = useMemo(() => ["project", id, "design-audit"] as const, [id]);
  const designAuditQuery = useQuery({
    queryKey: designAuditQueryKey,
    queryFn: async () => {
      const incoming = await getProjectDesignAudit(id ?? "");
      const current = queryClient.getQueryData<DesignAuditResult | null>(designAuditQueryKey) ?? null;
      return preferDesignAuditResult(current, incoming, id ?? "");
    },
    enabled: Boolean(id && artifactsQuery.data?.entrypoint_url),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const invalidateDesignAudit = useCallback(() => queryClient.invalidateQueries({ queryKey: designAuditQueryKey }), [designAuditQueryKey, queryClient]);
  const replayQuery = useQuery({
    queryKey: ["session", sessionQuery.data?.id, "events"],
    queryFn: () => listSessionEvents(sessionQuery.data!.id),
    enabled: Boolean(sessionQuery.data?.id),
  });
  const commentsQuery = useQuery({
    queryKey: ["project", id, "comments"],
    queryFn: () => listProjectComments(id!),
    enabled: Boolean(id),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const directionQueryKey = useMemo(
    () => ["project", id, "design-directions"] as const,
    [id],
  );
  const directionQuery = useQuery({
    queryKey: directionQueryKey,
    queryFn: async () => {
      const incoming = await getDesignDirectionState(id ?? "");
      const current =
        queryClient.getQueryData<DesignDirectionState | null>(directionQueryKey) ?? null;
      return preferDirectionState(current, incoming);
    },
    enabled: Boolean(id),
  });
  const mergeDirectionCache = useCallback(
    (incoming: DesignDirectionState | null) => {
      queryClient.setQueryData<DesignDirectionState | null>(
        directionQueryKey,
        (current) => preferDirectionState(current ?? null, incoming),
      );
    },
    [directionQueryKey, queryClient],
  );

  const generateDirectionsMutation = useMutation({
    mutationFn: () => generateDesignDirections(id ?? ""),
    onMutate: () => setDirectionActionError(null),
    onSuccess: mergeDirectionCache,
    onError: setDirectionActionError,
  });
  const cancelDirectionsMutation = useMutation({
    mutationFn: () => cancelDesignDirections(id ?? ""),
    onMutate: () => setDirectionActionError(null),
    onSuccess: mergeDirectionCache,
    onError: setDirectionActionError,
  });
  const retryDirectionsMutation = useMutation({
    mutationFn: () => retryDesignDirections(id ?? ""),
    onMutate: () => setDirectionActionError(null),
    onSuccess: mergeDirectionCache,
    onError: setDirectionActionError,
  });
  const selectDirectionMutation = useMutation({
    mutationFn: (input: {
      readonly generationId: string;
      readonly revision: number;
      readonly directionId: string;
    }) =>
      selectDesignDirection(id ?? "", {
        generation_id: input.generationId,
        expected_selection_revision: input.revision,
        direction_id: input.directionId,
      }),
    onMutate: () => setDirectionActionError(null),
    onSuccess: mergeDirectionCache,
    onError: setDirectionActionError,
  });
  const undoDirectionMutation = useMutation({
    mutationFn: (input: { readonly generationId: string; readonly revision: number }) =>
      undoDesignDirectionSelection(id ?? "", {
        generation_id: input.generationId,
        expected_selection_revision: input.revision,
      }),
    onMutate: () => setDirectionActionError(null),
    onSuccess: mergeDirectionCache,
    onError: setDirectionActionError,
  });

  const mergeDesignAuditCache = useCallback((incoming: DesignAuditResult) => {
    queryClient.setQueryData<DesignAuditResult | null>(designAuditQueryKey, (current) => preferDesignAuditResult(current ?? null, incoming, id ?? ""));
  }, [designAuditQueryKey, id, queryClient]);
  const retryDesignAuditMutation = useMutation({
    mutationFn: () => retryProjectDesignAudit(id ?? ""),
    onMutate: () => setAuditActionError(null),
    onSuccess: mergeDesignAuditCache,
    onError: (error) => setAuditActionError(error instanceof Error ? error : new Error(String(error))),
  });
  const safeFixMutation = useMutation({
    mutationFn: (input: { readonly findingId: string; readonly relPath: string; readonly request: PatchFileRequest }) =>
      patchProjectFile(id ?? "", input.relPath, input.request),
    onSuccess: async (_response, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id] }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "fs", input.relPath, "undo-info"] }),
        invalidateDesignAudit(),
      ]);
      setRefreshTick((value) => value + 1);
      pushToast({ title: "안전 수정을 적용했어요", tone: "success" });
    },
    onError: (error) => {
      pushToast({ title: "안전 수정을 적용하지 못했어요", body: DESIGN_AUDIT_ERROR_COPY[designAuditErrorCode(error)], tone: "error" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshArtifacts(id!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({
          queryKey: ["project", id, "artifacts"],
        }),
        invalidateDesignAudit(),
      ]);
      setRefreshTick((value) => value + 1);
    },
    onError: (error) => {
      pushToast({
        title: "Refresh failed",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: (input: {
      rel_path: string;
      x_pct: number;
      y_pct: number;
      node_selector: string;
      slide_index: number | null;
    }) => createProjectComment(id!, input),
    onSuccess: (created) => {
      queryClient.setQueryData<Comment[]>(
        ["project", id, "comments"],
        (prev) => (prev ? [...prev, created] : [created]),
      );
      setFocusedCommentId(created.id);
    },
    onError: (error) => {
      pushToast({
        title: "Could not create comment",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({
      commentId,
      patch,
    }: {
      commentId: string;
      patch: { body?: string; resolved?: boolean };
    }) => updateProjectComment(id!, commentId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Comment[]>(
        ["project", id, "comments"],
        (prev) =>
          prev
            ? prev.map((c) => (c.id === updated.id ? updated : c))
            : [updated],
      );
    },
    onError: (error) => {
      pushToast({
        title: "Could not update comment",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const toolDecisionMutation = useMutation({
    mutationFn: (input: {
      toolCallId: string;
      decision: "allow" | "deny";
    }) => submitToolDecision(id!, input),
    onSuccess: (_data, variables) => {
      setDecidedToolCallIds((prev) => {
        if (prev.has(variables.toolCallId)) return prev;
        const next = new Set(prev);
        next.add(variables.toolCallId);
        return next;
      });
    },
    onError: (error) => {
      pushToast({
        title: "Could not submit decision",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const tweaksMutation = useMutation({
    mutationFn: ({
      relPath,
      patch,
    }: {
      relPath: string;
      patch: PatchFileRequest;
    }) =>
      apiFetch<PatchFileResponse>(
        `/api/projects/${id}/fs/${encodeRelPath(relPath)}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      ),
    onSuccess: (_data, variables) => {
      const bgId = variables.patch.node_bg_id;
      setTweaksTarget((current) =>
        current && current.bg_id === bgId && variables.patch.styles
          ? mergeTweaksTargetInline(current, variables.patch.styles)
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["project", id, "files"] });
      void queryClient.invalidateQueries({ queryKey: ["project", id, "artifacts"] });
      void queryClient.invalidateQueries({
        queryKey: ["project", id, "fs", variables.relPath, "undo-info"],
      });
      void invalidateDesignAudit();
      setRefreshTick((value) => value + 1);
    },
    onError: (error) => {
      pushToast({
        title: "Could not apply tweak",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const patchFileMutation = useMutation({
    mutationFn: ({
      relPath,
      patch,
    }: {
      relPath: string;
      patch: PatchFileRequest;
    }) =>
      apiFetch<PatchFileResponse>(
        `/api/projects/${id}/fs/${encodeRelPath(relPath)}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      ),
    onSuccess: async (_updated, variables) => {
      setEditTarget((current) =>
        current && current.bg_id === variables.patch.node_bg_id
          ? applyEditPatch(current, variables.patch)
          : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "artifacts"] }),
        queryClient.invalidateQueries({
          queryKey: ["project", id, "fs", variables.relPath, "undo-info"],
        }),
        invalidateDesignAudit(),
      ]);
      setRefreshTick((value) => value + 1);
    },
    onError: (error) => {
      pushToast({
        title: "Could not save edit",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    const error = projectQuery.error;
    if (!(error instanceof ApiError) || error.status !== 404) {
      return;
    }
    pushToast({ title: "Project not found", tone: "error" });
    navigate("/", { replace: true });
  }, [navigate, projectQuery.error, pushToast]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    clearSendPending(sendPendingTimeoutRef, setSendPending);
    seenEventIdsRef.current.clear();
    latestEventTsRef.current = undefined;
    setEvents([]);
    setSessionState(null);
    setActiveTabId("design-system");
    setOpenFileTabs([]);
    setMode(null);
    setSelection(null);
    setFocusedCommentId(null);
    setActiveSlideIdx(null);
    setEditTarget(null);
    setTweaksTarget(null);
    tweaksUndoRef.current = [];
    tweaksRedoRef.current = [];
    setDrawShapes([]);
    setDrawResetKey("");
    setPresentOpen(false);
    setDecidedToolCallIds(new Set());
    setDirectionActionError(null);
    setAuditFocus(null);
    setAuditRevealResult(null);
    setAuditActionError(null);
    turnTouchedFilesRef.current = false;
    setRefreshTick(0);
  }, [id]);

  useEffect(() => {
    setEditTarget(null);
    setTweaksTarget(null);
  }, [activeTabId]);

  const restoreMutation = useMutation({
    mutationFn: (turnId: string) => restoreCheckpoint(id!, turnId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "artifacts"] }),
        invalidateDesignAudit(),
      ]);
      setRefreshTick((value) => value + 1);
      pushToast({ title: "Turn reverted", tone: "info" });
    },
    onError: (error) => {
      pushToast({
        title: "Could not revert turn",
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    },
  });

  const putDrawsMutation = useMutation({
    mutationFn: ({
      relPath,
      svg,
    }: {
      relPath: string;
      svg: string;
    }) => putProjectDraws(id!, relPath, svg),
    onError: (err) => {
      pushToast({
        title: "Could not save draw",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  // Load saved draws for the current file tab. Computed inline from
  // openFileTabs so we don't depend on the `activeRelPath` that's
  // derived later in render after the early-return guard.
  useEffect(() => {
    if (!id) return;
    const tab = openFileTabs.find((t) => t.id === activeTabId);
    const relForDraws = tab?.kind === "file" ? tab.relPath ?? null : null;
    if (!relForDraws) {
      setDrawShapes([]);
      setDrawResetKey(`none:${activeTabId}`);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const svg = await getProjectDraws(id, relForDraws);
        if (cancelled) return;
        setDrawShapes(deserializeDraws(svg));
        setDrawResetKey(`${id}:${relForDraws}:${Date.now()}`);
      } catch {
        if (cancelled) return;
        setDrawShapes([]);
        setDrawResetKey(`${id}:${relForDraws}:err`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeTabId, openFileTabs]);

  // Global Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z for Draw mode — routes to
  // DrawLayer's internal undo/redo stack via ref. Draw shapes don't need
  // the server-round-trip that Tweaks needs because the layer is purely
  // frontend state; the serialized PUT only fires on commit.
  useEffect(() => {
    if (mode !== "draw") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) drawLayerRef.current?.redo();
      else drawLayerRef.current?.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Global Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z for Tweaks. Only fires when the
  // user isn't typing into an input / textarea / contentEditable so the
  // inspector's own value fields still undo natively.
  useEffect(() => {
    if (mode !== "tweaks") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          t.isContentEditable
        ) {
          return;
        }
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        const frame = tweaksRedoRef.current.pop();
        if (!frame) return;
        tweaksUndoRef.current.push(frame);
        tweaksMutation.mutate({
          relPath: frame.relPath,
          patch: { node_bg_id: frame.bg_id, styles: frame.forward },
        });
      } else {
        const frame = tweaksUndoRef.current.pop();
        if (!frame) return;
        tweaksRedoRef.current.push(frame);
        tweaksMutation.mutate({
          relPath: frame.relPath,
          patch: { node_bg_id: frame.bg_id, styles: frame.inverse },
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, tweaksMutation]);

  useEffect(() => {
    if (!sessionQuery.data) return;
    // Initial seed only. Once events start flowing, `applyEventToSession`
    // owns the live session state — overriding it with a stale DB refetch
    // (e.g. the session row before `setSessionStatus("idle")` finishes)
    // would flip the status back to "running" after a turn completes.
    const next = sessionQuery.data;
    setSessionState((current) => {
      if (!current || current.id !== next.id) return next;
      if (current.backend_id === next.backend_id) return current;
      return {
        ...current,
        backend_id: next.backend_id,
        updated_at: Math.max(current.updated_at, next.updated_at),
        last_active_at: Math.max(current.last_active_at, next.last_active_at),
      };
    });
  }, [sessionQuery.data]);

  useEffect(() => {
    if (!replayQuery.data) return;
    appendEvents(replayQuery.data, seenEventIdsRef, latestEventTsRef, setEvents);
    const latest = latestDirectionState(replayQuery.data);
    mergeDirectionCache(latest === null ? null : parseDesignDirectionState(latest));
  }, [mergeDirectionCache, replayQuery.data]);

  useEffect(() => {
    const sessionId = sessionQuery.data?.id;
    if (!sessionId || replayQuery.status !== "success") return;

    let active = true;
    let cleanup = () => {};

    const connect = () => {
      cleanup = subscribeSessionStream(sessionId, (event) => {
        if (event.type === "design.direction_state") {
          mergeDirectionCache(parseDesignDirectionState(event.state));
        }
        appendEvents([event], seenEventIdsRef, latestEventTsRef, setEvents);
        setSessionState((current) => applyEventToSession(current, event));
        if (
          event.type === "chat.user_message" ||
          event.type === "status.running" ||
          event.type === "status.error" ||
          event.type === "status.idle"
        ) {
          clearSendPending(sendPendingTimeoutRef, setSendPending);
        }

        if (event.type === "file.changed") turnTouchedFilesRef.current = true;
        if (event.type === "status.idle" && turnTouchedFilesRef.current) {
          turnTouchedFilesRef.current = false;
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["project", id, "artifacts"] }),
            invalidateDesignAudit(),
          ]);
        }
        if (event.type === "status.error") turnTouchedFilesRef.current = false;

        if (event.type === "file.changed" && id) {
          openFileAsTab(event.path, setOpenFileTabs, setActiveTabId);
          if (activeTabIdRef.current === event.path) {
            setRefreshTick((value) => value + 1);
          }
          void queryClient.invalidateQueries({
            queryKey: ["project", id, "files"],
          });
        }

        // No sessionQuery invalidation on usage.delta — applyEventToSession
        // accumulates usage locally. A refetch here was racing with the
        // backend's own setSessionStatus("idle") call and flipping the
        // status back to "running" mid-sequence.
      });
    };

    void connect();

    return () => {
      active = false;
      cleanup();
    };
  }, [id, invalidateDesignAudit, mergeDirectionCache, queryClient, replayQuery.status, sessionQuery.data?.id]);

  useEffect(() => {
    const project = projectQuery.data;
    if (!project || !project.entrypoint) return;
    openFileAsTab(project.entrypoint, setOpenFileTabs, setActiveTabId);
  }, [projectQuery.data]);

  const project = projectQuery.data ?? null;
  const files: FileInfo[] = filesQuery.data ?? [];
  const artifacts = artifactsQuery.data ?? null;
  const session = sessionState;
  const directionState = directionQuery.data ?? null;
  const directionActionPending =
    generateDirectionsMutation.isPending ||
    cancelDirectionsMutation.isPending ||
    retryDirectionsMutation.isPending ||
    selectDirectionMutation.isPending ||
    undoDirectionMutation.isPending;
  const directionError =
    directionActionError ??
    (directionState === null && directionQuery.error instanceof Error
      ? directionQuery.error
      : null);
  const directionLoading = directionState?.status === "loading";
  const chatComposerDisabled = sendPending || session?.status === "running";
  const composerDisabled = chatComposerDisabled || directionLoading;

  // Turn clock. When the composer flips from idle to busy we stamp a
  // start time; a 1s ticker then drives re-renders so `canInterrupt`
  // flips on exactly once the configured threshold has elapsed.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (chatComposerDisabled) {
      setTurnStartedAt((prev) => prev ?? Date.now());
    } else {
      setTurnStartedAt(null);
    }
  }, [chatComposerDisabled]);
  useEffect(() => {
    if (!chatComposerDisabled) return;
    const handle = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [chatComposerDisabled]);
  const abortThresholdMs =
    settingsQuery.data?.chat_abort_threshold_ms ?? 300_000;
  const canInterrupt =
    chatComposerDisabled &&
    turnStartedAt != null &&
    nowTs - turnStartedAt >= abortThresholdMs;

  const interruptMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("no_session");
      return interruptSession(session.id);
    },
    onError: (err) => {
      pushToast({
        title: "Could not interrupt turn",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });
  useEffect(() => {
    if (designAuditQuery.dataUpdatedAt > 0) setAuditActionError(null);
  }, [designAuditQuery.dataUpdatedAt]);
  const auditReport = designAuditQuery.data ?? null;
  const auditError = auditActionError ?? (designAuditQuery.error instanceof Error ? designAuditQuery.error : null);
  const auditState = designAuditViewState({
    renderable: Boolean(artifactsQuery.data?.entrypoint_url), report: auditReport,
    pending: designAuditQuery.isFetching, rerunning: retryDesignAuditMutation.isPending,
    errorCode: auditError === null ? null : designAuditErrorCode(auditError),
    currentDigest: artifactsQuery.data?.current_digest ?? "",
  });
  const openQuality = useCallback(() => {
    const detail = projectQuery.data;
    if (!artifactsQuery.data?.entrypoint_url || !detail) {
      pushToast({ title: "품질 점검을 열 수 없어요", body: "렌더링 가능한 결과물이 아직 없어요.", tone: "warn" });
      return;
    }
    if (!openFileTabs.some((tab) => tab.id === activeTabId)) openFileAsTab(detail.entrypoint, setOpenFileTabs, setActiveTabId);
    setMode("quality");
  }, [activeTabId, artifactsQuery.data?.entrypoint_url, openFileTabs, projectQuery.data, pushToast]);
  const qualityGate = auditReport !== null && isDesignAuditCurrent(auditReport, artifactsQuery.data?.current_digest ?? "") && auditReport.overall_status === "must_fix"
    ? { mustFixCount: groupDesignAuditResult(auditReport).mustFix.length } : null;

  const handleQualityRevealResult = useCallback((nodeBgId: string, found: boolean) => {
    if (auditFocus?.nodeBgId === nodeBgId) setAuditRevealResult(found ? "found" : "not_found");
  }, [auditFocus?.nodeBgId]);

  const tabs = useMemo(
    () => buildTabs(project, openFileTabs),
    [openFileTabs, project],
  );
  const pendingPermissions = useMemo<PermissionRequest[]>(() => {
    const seen = new Set<string>();
    const out: PermissionRequest[] = [];
    for (const event of events) {
      if (event.type !== "tool.permission_required") continue;
      if (decidedToolCallIds.has(event.toolCallId)) continue;
      if (seen.has(event.toolCallId)) continue;
      seen.add(event.toolCallId);
      out.push({
        toolCallId: event.toolCallId,
        tool: event.tool,
        input: event.input,
      });
    }
    return out;
  }, [events, decidedToolCallIds]);

  const canvasSrc = useMemo(() => {
    const activeFile = tabs.find(
      (tab) => tab.id === activeTabId && tab.kind === "file" && tab.relPath,
    );
    if (activeFile?.relPath && project) {
      return `/api/projects/${project.id}/fs/${encodeRelPath(activeFile.relPath)}`;
    }
    // Only accept an entrypoint URL that actually has a file segment.
    // A bare `/api/projects/X/fs/` triggers the `relPath: ""` 404 loop.
    const fallback = artifacts?.entrypoint_url ?? null;
    if (!fallback || /\/fs\/?$/.test(fallback)) return null;
    return fallback;
  }, [activeTabId, artifacts?.entrypoint_url, project, tabs]);

  // File-level single-step undo (audit fix #7). Tracks per-file undo
  // availability and exposes it through the canvas top bar. Server
  // keeps the previous content of the last patched file in memory and
  // rolls back on POST /undo. The query key includes activeTabId so a
  // tab switch refetches; the patch / tweaks mutations invalidate
  // this key so a successful save flips canUndo from false → true.
  const undoActiveRelPath = useMemo<string | null>(() => {
    const activeFile = tabs.find(
      (tab) => tab.id === activeTabId && tab.kind === "file" && tab.relPath,
    );
    return activeFile?.relPath ?? null;
  }, [activeTabId, tabs]);
  const undoInfoQuery = useQuery({
    queryKey: ["project", id, "fs", undoActiveRelPath, "undo-info"] as const,
    queryFn: () => {
      if (!id || !undoActiveRelPath) {
        return { can_undo: false, stored_at: null };
      }
      return getFileUndoInfo(id, undoActiveRelPath);
    },
    enabled: Boolean(id && undoActiveRelPath),
  });
  const undoMutation = useMutation({
    mutationFn: () => {
      if (!id || !undoActiveRelPath) {
        throw new Error("no_active_file");
      }
      return undoLastFilePatch(id, undoActiveRelPath);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["project", id, "fs", undoActiveRelPath, "undo-info"],
        }),
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({
          queryKey: ["project", id, "artifacts"],
        }),
        invalidateDesignAudit(),
      ]);
      setSelection(null);
      setTweaksTarget(null);
      setTweakReview(null);
      setMode((current) => current === "quality" ? current : null);
      setRefreshTick((value) => value + 1);
      pushToast({ title: "마지막 저장을 실행 취소했어요", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Could not undo",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!tabs.find((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "design-system");
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (mode !== "quality") { setAuditFocus(null); setAuditRevealResult(null); }
  }, [mode]);
  useEffect(() => { setAuditFocus(null); setAuditRevealResult(null); }, [auditReport?.artifact_digest, auditReport?.created_at]);

  const isLoading =
    projectQuery.isLoading ||
    sessionQuery.isLoading ||
    filesQuery.isLoading ||
    artifactsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-sm text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (!project || !session || !artifacts) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-sm text-destructive">Project unavailable</div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeRelPath =
    activeTab?.kind === "file" && activeTab.relPath ? activeTab.relPath : null;
  const comments = commentsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectTopBar
        project={project}
        canPresent={
          project.type === "slide_deck" &&
          activeTab?.kind === "file" &&
          Boolean(canvasSrc)
        }
        onPresent={() => setPresentOpen(true)}
        qualityGate={qualityGate}
        onOpenQuality={openQuality}
        tabsSlot={
          <ArtifactTabs
            tabs={tabs}
            activeId={activeTabId}
            onSelect={setActiveTabId}
            onClose={(tabId) => {
              setOpenFileTabs((current) =>
                current.filter((tab) => tab.id !== tabId),
              );
              if (activeTabId === tabId) {
                setActiveTabId("design-system");
              }
            }}
          />
        }
      />
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        <ChatPane
          events={events}
          session={session}
          composerDisabled={composerDisabled}
          canInterrupt={canInterrupt}
          interruptPending={interruptMutation.isPending}
          onInterrupt={() => interruptMutation.mutate()}
          composerInitialText={composerPrefill}
          statusSlot={
            <DirectionStatusBar
              state={directionState}
              cancelPending={cancelDirectionsMutation.isPending}
              onOpen={() => setActiveTabId("directions")}
              onCancel={() => cancelDirectionsMutation.mutate()}
            />
          }
          onSend={async (text, attachedFiles, signal) => {
            if (composerDisabled) {
              return;
            }
            // The backend persists+publishes a `chat.user_message` normalized
            // event as the first step of runUserTurn, so it echoes back
            // through SSE within ~10ms on localhost. No optimistic local
            // state needed — and this way history survives a page reload.
            setSendPending(true);
            armSendPendingFallback(sendPendingTimeoutRef, setSendPending);

            try {
              await sendUserEvent(session.id, {
                type: "user.message",
                text,
                files: attachedFiles,
              }, { signal });
            } catch (error) {
              clearSendPending(sendPendingTimeoutRef, setSendPending);
              if (!(error instanceof DOMException && error.name === "AbortError")) {
                pushToast({
                  title:
                    error instanceof ApiError && error.status === 409
                      ? "Turn already running"
                      : "Could not send message",
                  body: error instanceof Error ? error.message : String(error),
                  tone: "error",
                });
              }
              throw error;
            }
          }}
          onOpenFile={(relPath) =>
            openFileAsTab(relPath, setOpenFileTabs, setActiveTabId)
          }
          onRevertTurn={(turnId) => restoreMutation.mutate(turnId)}
          revertingTurnId={
            restoreMutation.isPending
              ? (restoreMutation.variables as string | undefined) ?? null
              : null
          }
        />

        {activeTab?.kind === "design_system" && (
          <DesignSystemView
            systemIdOverride={project.design_system_id ?? undefined}
          />
        )}

        {activeTab?.kind === "design_files" && (
          <DesignFilesView
            files={files}
            onOpenInCanvas={(relPath) =>
              openFileAsTab(relPath, setOpenFileTabs, setActiveTabId)
            }
          />
        )}

        {activeTab?.kind === "directions" && (
          <DirectionsView
            state={directionState}
            recovering={directionQuery.isLoading}
            actionPending={directionActionPending}
            cancelPending={cancelDirectionsMutation.isPending}
            error={directionError}
            onGenerate={() => generateDirectionsMutation.mutate()}
            onCancel={() => cancelDirectionsMutation.mutate()}
            onRetry={() => retryDirectionsMutation.mutate()}
            onSelect={(directionId) => {
              if (directionState === null) return;
              selectDirectionMutation.mutate({
                generationId: directionState.generation_id,
                revision: directionState.selection_revision,
                directionId,
              });
            }}
            onUndo={() => {
              if (directionState === null) return;
              undoDirectionMutation.mutate({
                generationId: directionState.generation_id,
                revision: directionState.selection_revision,
              });
            }}
          />
        )}

        {activeTab?.kind === "file" && (
          <>
            <Canvas
              mode={mode}
              src={canvasSrc}
              frameKey={`${canvasSrc ?? "entrypoint"}:${refreshTick}`}
              onModeChange={setMode}
              onSelect={(next) => {
                setSelection(next);
                if (!next) setTweakReview(null);
              }}
              onRefresh={() => {
                if (!id) return;
                refreshMutation.mutate();
              }}
              canUndo={Boolean(undoInfoQuery.data?.can_undo)}
              undoPending={undoMutation.isPending}
              onUndo={() => undoMutation.mutate()}
              qualityFocusedNodeId={auditFocus?.relPath === activeRelPath ? auditFocus.nodeBgId : null}
              onQualityRevealResult={handleQualityRevealResult}
              comments={comments}
              activeRelPath={activeRelPath}
              activeSlideIdx={activeSlideIdx}
              focusedCommentId={focusedCommentId}
              onCreateComment={(input) => {
                if (!activeRelPath) return;
                createCommentMutation.mutate({
                  rel_path: activeRelPath,
                  ...input,
                });
              }}
              onFocusComment={setFocusedCommentId}
              onActiveSlideChange={setActiveSlideIdx}
              editSelectedBgId={editTarget?.bg_id ?? null}
              onSelectEditTarget={setEditTarget}
              tweaksSelectedBgId={tweaksTarget?.bg_id ?? null}
              onSelectTweaksTarget={setTweaksTarget}
              drawTool={drawTool}
              drawColor={drawColor}
              drawStrokeWidth={drawStrokeWidth}
              drawInitialShapes={drawShapes}
              drawResetKey={drawResetKey}
              drawLayerRef={drawLayerRef}
              onCommitDraws={(shapes) => {
                setDrawShapes(shapes);
                if (!activeRelPath) return;
                const rect = document
                  .querySelector("iframe")
                  ?.getBoundingClientRect();
                const svg = serializeDraws(
                  rect?.width ?? 1280,
                  rect?.height ?? 720,
                  shapes,
                );
                putDrawsMutation.mutate({ relPath: activeRelPath, svg });
              }}
            />
            <ModePanel
              mode={mode}
              quality={{
                state: auditState,
                pendingFindingId: safeFixMutation.isPending ? safeFixMutation.variables?.findingId ?? null : null,
                focusedFindingId: auditFocus?.findingId ?? null,
                revealResult: auditRevealResult,
                onRetry: () => { if (!safeFixMutation.isPending && !designAuditQuery.isFetching && !retryDesignAuditMutation.isPending) retryDesignAuditMutation.mutate(); },
                onOpenFile: (finding) => openFileAsTab(finding.source.rel_path, setOpenFileTabs, setActiveTabId),
                onReveal: (finding) => {
                  openFileAsTab(finding.source.rel_path, setOpenFileTabs, setActiveTabId);
                  setMode("quality");
                  if (finding.source.node_bg_id !== null) {
                    setAuditFocus({ findingId: finding.id, nodeBgId: finding.source.node_bg_id, relPath: finding.source.rel_path });
                    setAuditRevealResult(null);
                  }
                },
                onApplySafeFix: (finding) => {
                  if (finding.safe_fix === undefined || auditReport === null || designAuditQuery.isFetching || retryDesignAuditMutation.isPending || safeFixMutation.isPending || !isDesignAuditCurrent(auditReport, artifacts.current_digest)) return;
                  openFileAsTab(finding.safe_fix.rel_path, setOpenFileTabs, setActiveTabId);
                  if (finding.source.node_bg_id !== null) setAuditFocus({ findingId: finding.id, nodeBgId: finding.source.node_bg_id, relPath: finding.source.rel_path });
                  safeFixMutation.mutate({ findingId: finding.id, relPath: finding.safe_fix.rel_path, request: finding.safe_fix.request });
                },
              }}
              selection={selection}
              onPromoteToTweaks={() => {
                const target = selectedNodeToTweaksTarget(selection);
                if (!target) return;
                setTweaksTarget(target);
                setMode("tweaks");
              }}
              comments={comments}
              activeRelPath={activeRelPath}
              activeSlideIdx={activeSlideIdx}
              focusedCommentId={focusedCommentId}
              onFocusComment={setFocusedCommentId}
              onUpdateCommentBody={(commentId, body) =>
                updateCommentMutation.mutate({
                  commentId,
                  patch: { body },
                })
              }
              onToggleCommentResolved={(commentId, resolved) =>
                updateCommentMutation.mutate({
                  commentId,
                  patch: { resolved },
                })
              }
              editTarget={editTarget}
              editSaving={patchFileMutation.isPending}
              onSaveEdit={(patch) => {
                if (!activeRelPath || !editTarget) return;
                patchFileMutation.mutate({
                  relPath: activeRelPath,
                  patch: {
                    node_bg_id: editTarget.bg_id,
                    ...patch,
                  },
                });
              }}
              onClearEdit={() => setEditTarget(null)}
              tweaksTarget={tweaksTarget}
              tweakReview={tweakReview}
              tweaksSaving={tweaksMutation.isPending}
              onApplyTweak={(patch) => {
                if (!activeRelPath || !tweaksTarget) return;
                setTweakReview(buildTweakChangePreview(tweaksTarget, patch));
                const frame = buildTweaksUndoFrame(
                  tweaksTarget,
                  activeRelPath,
                  patch,
                );
                tweaksUndoRef.current.push(frame);
                tweaksRedoRef.current = [];
                tweaksMutation.mutate({
                  relPath: activeRelPath,
                  patch: {
                    node_bg_id: tweaksTarget.bg_id,
                    styles: patch,
                  },
                });
              }}
              onResetTweaks={() => {
                if (!activeRelPath || !tweaksTarget) return;
                const keys = Object.keys(tweaksTarget.inline);
                if (keys.length === 0) return;
                const patch: Record<string, null> = {};
                for (const k of keys) patch[k] = null;
                const frame = buildTweaksUndoFrame(
                  tweaksTarget,
                  activeRelPath,
                  patch as Partial<Record<TweaksStyleKey, string | null>>,
                );
                tweaksUndoRef.current.push(frame);
                tweaksRedoRef.current = [];
                tweaksMutation.mutate({
                  relPath: activeRelPath,
                  patch: {
                    node_bg_id: tweaksTarget.bg_id,
                    styles: patch,
                  },
                });
              }}
              onClearTweaks={() => {
                setTweaksTarget(null);
                setTweakReview(null);
              }}
              drawTool={drawTool}
              drawColor={drawColor}
              drawStrokeWidth={drawStrokeWidth}
              drawHasShapes={drawShapes.length > 0}
              onChangeDrawTool={setDrawTool}
              onChangeDrawColor={setDrawColor}
              onChangeDrawWidth={setDrawStrokeWidth}
              onUndoDraw={() => drawLayerRef.current?.undo()}
              onRedoDraw={() => drawLayerRef.current?.redo()}
              onClearDraw={() => drawLayerRef.current?.clear()}
            />
          </>
        )}
      </div>
      <PermissionDialog
        request={pendingPermissions[0] ?? null}
        pending={toolDecisionMutation.isPending}
        onDecide={(decision) => {
          const head = pendingPermissions[0];
          if (!head) return;
          toolDecisionMutation.mutate({
            toolCallId: head.toolCallId,
            decision,
          });
        }}
      />
      {presentOpen && canvasSrc && (
        <PresentOverlay
          src={canvasSrc}
          onClose={() => setPresentOpen(false)}
        />
      )}
    </div>
  );
}

function appendEvents(
  incoming: NormalizedEvent[],
  seenEventIdsRef: MutableRefObject<Set<string>>,
  latestEventTsRef: MutableRefObject<number | undefined>,
  setEvents: Dispatch<SetStateAction<NormalizedEvent[]>>,
) {
  if (incoming.length === 0) return;

  const next = incoming.filter((event) => !seenEventIdsRef.current.has(event.id));
  if (next.length === 0) return;

  for (const event of next) {
    seenEventIdsRef.current.add(event.id);
    latestEventTsRef.current = Math.max(
      latestEventTsRef.current ?? 0,
      event.ts,
    );
  }

  setEvents((current) => mergeEvents(current, next));
}

function buildTabs(
  project: ProjectDetail | null,
  openFileTabs: ArtifactTab[],
): ArtifactTab[] {
  return [
    {
      id: "design-system",
      title: project?.design_system_name ?? "Design System",
      kind: "design_system",
      closeable: false,
    },
    {
      id: "directions",
      title: "방향 정하기",
      kind: "directions",
      closeable: false,
    },
    {
      id: "design-files",
      title: "Design Files",
      kind: "design_files",
      closeable: false,
    },
    ...openFileTabs,
  ];
}

function mergeEvents(current: NormalizedEvent[], incoming: NormalizedEvent[]) {
  const merged = new Map<string, NormalizedEvent>();
  for (const event of current) merged.set(event.id, event);
  for (const event of incoming) merged.set(event.id, event);
  return [...merged.values()].sort((a, b) =>
    a.ts === b.ts ? a.id.localeCompare(b.id) : a.ts - b.ts,
  );
}

function applyEventToSession(
  current: SessionInfo | null,
  event: NormalizedEvent,
): SessionInfo | null {
  if (!current) return current;

  switch (event.type) {
    case "usage.delta":
      // Accumulate live. Replay events pass through `setEvents` only, not
      // through `applyEventToSession`, so there's no double-counting here.
      return {
        ...current,
        usage: {
          ...current.usage,
          input: current.usage.input + event.input,
          output: current.usage.output + event.output,
          cached: current.usage.cached + (event.cached ?? 0),
        },
        updated_at: event.ts,
        last_active_at: event.ts,
      };
    case "status.running":
      return {
        ...current,
        status: "running",
        updated_at: event.ts,
        last_active_at: event.ts,
      };
    case "status.idle":
      return {
        ...current,
        status: "idle",
        updated_at: event.ts,
        last_active_at: event.ts,
      };
    case "status.error":
      return {
        ...current,
        status: "error",
        updated_at: event.ts,
        last_active_at: event.ts,
      };
    default:
      return current;
  }
}

function openFileAsTab(
  relPath: string,
  setOpenFileTabs: Dispatch<SetStateAction<ArtifactTab[]>>,
  setActiveTabId: Dispatch<SetStateAction<string>>,
) {
  // Reject empty / whitespace-only paths — they'd surface as a canvas tab
  // pointing to `/api/projects/X/fs/` and spam the network with 404s.
  if (!relPath || !relPath.trim()) return;
  setOpenFileTabs((current) => {
    if (current.some((tab) => tab.relPath === relPath)) return current;
    return [
      ...current,
      {
        id: relPath,
        title: relPath,
        kind: "file",
        relPath,
        closeable: true,
      },
    ];
  });
  setActiveTabId(relPath);
}

function encodeRelPath(relPath: string) {
  return relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Undo frame for Tweaks mode. Capture the style values that WERE there so
 * Cmd/Ctrl+Z can re-emit the inverse PATCH. `forward` is the original
 * change so Cmd/Ctrl+Shift+Z can replay it after an undo.
 */
interface TweaksUndoFrame {
  bg_id: string;
  relPath: string;
  forward: Partial<Record<TweaksStyleKey, string | null>>;
  inverse: Partial<Record<TweaksStyleKey, string | null>>;
}

function buildTweaksUndoFrame(
  target: TweaksTarget,
  relPath: string,
  patch: Partial<Record<TweaksStyleKey, string | null>>,
): TweaksUndoFrame {
  const inverse: Partial<Record<TweaksStyleKey, string | null>> = {};
  for (const key of Object.keys(patch) as TweaksStyleKey[]) {
    const prev = target.inline[key];
    inverse[key] = prev === undefined ? null : prev;
  }
  return {
    bg_id: target.bg_id,
    relPath,
    forward: patch,
    inverse,
  };
}

function mergeTweaksTargetInline(
  target: TweaksTarget,
  patch: Record<string, string | null>,
): TweaksTarget {
  const nextInline = { ...target.inline };
  for (const [key, value] of Object.entries(patch)) {
    const k = key as TweaksStyleKey;
    if (value === null) {
      delete nextInline[k];
    } else {
      nextInline[k] = value;
    }
  }
  return { ...target, inline: nextInline };
}

function applyEditPatch(
  target: EditTarget,
  patch: PatchFileRequest,
): EditTarget {
  const nextAttributes = { ...target.attributes };
  for (const [key, value] of Object.entries(patch.attributes ?? {})) {
    if (value === null) {
      delete nextAttributes[key];
    } else {
      nextAttributes[key] = value;
    }
  }

  return {
    ...target,
    text: patch.text ?? target.text,
    attributes: nextAttributes,
  };
}

function clearSendPending(
  timerRef: MutableRefObject<number | null>,
  setSendPending: Dispatch<SetStateAction<boolean>>,
) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  setSendPending(false);
}

function armSendPendingFallback(
  timerRef: MutableRefObject<number | null>,
  setSendPending: Dispatch<SetStateAction<boolean>>,
) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
  }
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    setSendPending(false);
  }, 5000);
}
