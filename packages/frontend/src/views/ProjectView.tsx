import {
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
  FileInfo,
  NormalizedEvent,
  ProjectDetail,
  SessionInfo,
} from "@bg/shared";
import { useNavigate, useParams } from "react-router-dom";
import {
  getArtifacts,
  getProject,
  getProjectSession,
  listProjectFiles,
  refreshArtifacts,
} from "@/api/project";
import { ApiError } from "@/api/client";
import {
  listSessionEvents,
  sendUserEvent,
  subscribeSessionStream,
} from "@/api/session";
import ChatPane from "@/components/chat/ChatPane";
import type { UserMessageLocal } from "@/components/chat/MessageStream";
import Canvas from "@/components/canvas/Canvas";
import ModePanel from "@/components/modes/ModePanel";
import type { CanvasMode } from "@/components/modes/types";
import ArtifactTabs from "@/components/project/ArtifactTabs";
import ProjectTopBar from "@/components/project/ProjectTopBar";
import DesignFilesView from "@/views/DesignFilesView";
import DesignSystemView from "@/views/DesignSystemView";
import { useUIStore } from "@/state/uiStore";
import type { ArtifactTab, SelectedNode } from "@/types/project";

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [userMessages, setUserMessages] = useState<UserMessageLocal[]>([]);
  const [sessionState, setSessionState] = useState<SessionInfo | null>(null);
  const [activeTabId, setActiveTabId] = useState("design-system");
  const [openFileTabs, setOpenFileTabs] = useState<ArtifactTab[]>([]);
  const [mode, setMode] = useState<CanvasMode | null>(null);
  const [selection, setSelection] = useState<SelectedNode | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const seenEventIdsRef = useRef(new Set<string>());
  const latestEventTsRef = useRef<number | undefined>(undefined);

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
  const replayQuery = useQuery({
    queryKey: ["session", sessionQuery.data?.id, "events"],
    queryFn: () => listSessionEvents(sessionQuery.data!.id),
    enabled: Boolean(sessionQuery.data?.id),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshArtifacts(id!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", id, "files"] }),
        queryClient.invalidateQueries({
          queryKey: ["project", id, "artifacts"],
        }),
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

  useEffect(() => {
    const error = projectQuery.error;
    if (!(error instanceof ApiError) || error.status !== 404) {
      return;
    }
    pushToast({ title: "Project not found", tone: "error" });
    navigate("/", { replace: true });
  }, [navigate, projectQuery.error, pushToast]);

  useEffect(() => {
    if (!sessionQuery.data) return;
    // Initial seed only. Once events start flowing, `applyEventToSession`
    // owns the live session state — overriding it with a stale DB refetch
    // (e.g. the session row before `setSessionStatus("idle")` finishes)
    // would flip the status back to "running" after a turn completes.
    setSessionState((current) => current ?? sessionQuery.data ?? null);
  }, [sessionQuery.data]);

  useEffect(() => {
    if (!replayQuery.data) return;
    appendEvents(replayQuery.data, seenEventIdsRef, latestEventTsRef, setEvents);
  }, [replayQuery.data]);

  useEffect(() => {
    const sessionId = sessionQuery.data?.id;
    if (!sessionId || replayQuery.status !== "success") return;

    let active = true;
    let cleanup = () => {};

    const connect = async () => {
      const gap = await listSessionEvents(sessionId, latestEventTsRef.current);
      if (!active) return;

      appendEvents(gap, seenEventIdsRef, latestEventTsRef, setEvents);
      cleanup = subscribeSessionStream(sessionId, (event) => {
        appendEvents([event], seenEventIdsRef, latestEventTsRef, setEvents);
        setSessionState((current) => applyEventToSession(current, event));

        if (event.type === "file.changed" && id) {
          openFileAsTab(event.path, setOpenFileTabs, setActiveTabId);
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
  }, [id, queryClient, replayQuery.status, sessionQuery.data?.id]);

  useEffect(() => {
    const project = projectQuery.data;
    if (!project || !project.entrypoint) return;
    openFileAsTab(project.entrypoint, setOpenFileTabs, setActiveTabId);
  }, [projectQuery.data]);

  const project = projectQuery.data ?? null;
  const files: FileInfo[] = filesQuery.data ?? [];
  const artifacts = artifactsQuery.data ?? null;
  const session = sessionState;
  const tabs = useMemo(
    () => buildTabs(project, openFileTabs),
    [openFileTabs, project],
  );
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

  useEffect(() => {
    if (!tabs.find((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "design-system");
    }
  }, [activeTabId, tabs]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectTopBar
        project={project}
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
      <div className="flex min-h-0 flex-1">
        <ChatPane
          events={events}
          userMessages={userMessages}
          session={session}
          onSend={(text, attachedFiles) => {
            // No status gate — backend accepts the message via fire-and-forget
            // regardless of current session state. Removing this prevents the
            // UI from getting stuck when a stale session refetch briefly
            // reports "running" after a turn just ended.

            // Optimistically echo the user's own message into the chat.
            setUserMessages((prev) => [
              ...prev,
              {
                id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                ts: Date.now(),
                text,
                attachmentCount: attachedFiles.length,
              },
            ]);

            void sendUserEvent(session.id, {
              type: "user.message",
              text,
              files: attachedFiles,
            }).catch((error) => {
              pushToast({
                title: "Could not send message",
                body: error instanceof Error ? error.message : String(error),
                tone: "error",
              });
            });
          }}
          onOpenFile={(relPath) =>
            openFileAsTab(relPath, setOpenFileTabs, setActiveTabId)
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

        {activeTab?.kind === "file" && (
          <>
            <Canvas
              mode={mode}
              src={canvasSrc}
              frameKey={`${canvasSrc ?? "entrypoint"}:${refreshTick}`}
              onModeChange={setMode}
              onSelect={setSelection}
              onRefresh={() => {
                if (!id) return;
                refreshMutation.mutate();
              }}
            />
            <ModePanel mode={mode} selection={selection} />
          </>
        )}
      </div>
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
