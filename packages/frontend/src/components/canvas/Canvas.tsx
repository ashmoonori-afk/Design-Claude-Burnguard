import { useEffect, useRef, useState } from "react";
import type { Comment } from "@bg/shared";
import CanvasTopBar from "./CanvasTopBar";
import CommentLayer from "./CommentLayer";
import type { Ref } from "react";
import DrawLayer, {
  type DrawLayerHandle,
  type DrawShape,
  type DrawTool,
} from "./DrawLayer";
import EditLayer, { type EditTarget } from "./EditLayer";
import SelectorOverlay from "./SelectorOverlay";
import TweaksLayer, { type TweaksTarget } from "./TweaksLayer";
import {
  buildSandboxedArtifactSrcDoc,
  requestFrameSetActiveSlide,
  subscribeFrameEvent,
} from "./frame-bridge";
import type { CanvasMode } from "@/components/modes/types";
import type { SelectedNode } from "@/types/project";

const PLACEHOLDER_SRC = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #101318;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: grid;
      place-items: center;
      min-height: 100vh;
    }
    .wrap { text-align: center; padding: 48px; }
    .eyebrow {
      color: #E06B4C;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    .title {
      font-size: 120px;
      line-height: 0.95;
      letter-spacing: -0.03em;
      font-weight: 800;
      color: #fff;
      margin: 0;
    }
    .subtitle {
      color: rgba(255,255,255,0.7);
      font-size: 20px;
      line-height: 1.6;
      margin-top: 48px;
      max-width: 640px;
    }
  </style>
</head>
<body>
  <section class="wrap">
    <div class="eyebrow">BurnGuard Canvas</div>
    <h1 class="title">Artifact preview</h1>
    <p class="subtitle">Your live project artifact appears here once the backend entrypoint is available.</p>
  </section>
</body>
</html>`;

export default function Canvas({
  mode,
  src,
  frameKey,
  onModeChange,
  onSelect,
  onRefresh,
  comments,
  activeRelPath,
  activeSlideIdx,
  focusedCommentId,
  onCreateComment,
  onFocusComment,
  editSelectedBgId,
  onSelectEditTarget,
  tweaksSelectedBgId,
  onSelectTweaksTarget,
  drawTool,
  drawColor,
  drawStrokeWidth,
  drawInitialShapes,
  drawResetKey,
  drawLayerRef,
  onCommitDraws,
  onActiveSlideChange,
}: {
  mode: CanvasMode | null;
  src?: string | null;
  frameKey?: string;
  onModeChange: (m: CanvasMode | null) => void;
  onSelect: (s: SelectedNode | null) => void;
  onRefresh: () => void;
  comments: Comment[];
  activeRelPath: string | null;
  activeSlideIdx: number | null;
  focusedCommentId: string | null;
  onCreateComment: (input: {
    x_pct: number;
    y_pct: number;
    node_selector: string;
    slide_index: number | null;
  }) => void;
  onFocusComment: (id: string | null) => void;
  editSelectedBgId: string | null;
  onSelectEditTarget: (target: EditTarget | null) => void;
  tweaksSelectedBgId: string | null;
  onSelectTweaksTarget: (target: TweaksTarget | null) => void;
  drawTool: DrawTool;
  drawColor: string;
  drawStrokeWidth: number;
  drawInitialShapes: DrawShape[];
  drawResetKey: string;
  drawLayerRef: Ref<DrawLayerHandle>;
  onCommitDraws: (shapes: DrawShape[]) => void;
  onActiveSlideChange: (value: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastKnownSlideIdxRef = useRef<number | null>(null);
  const restoreTargetSlideIdxRef = useRef<number | null>(null);
  const restoringSlideRef = useRef(false);
  const [frameSrcDoc, setFrameSrcDoc] = useState<string | null>(null);

  useEffect(() => {
    if (activeSlideIdx != null) {
      lastKnownSlideIdxRef.current = activeSlideIdx;
    }
  }, [activeSlideIdx]);

  useEffect(() => {
    if (!src) {
      restoreTargetSlideIdxRef.current = null;
      restoringSlideRef.current = false;
      return;
    }
    restoreTargetSlideIdxRef.current = lastKnownSlideIdxRef.current;
    restoringSlideRef.current = restoreTargetSlideIdxRef.current != null;
  }, [frameKey, src]);

  useEffect(() => {
    if (!src) {
      setFrameSrcDoc(null);
      return;
    }

    let cancelled = false;
    setFrameSrcDoc(null);

    void fetch(src)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`artifact_fetch_failed:${response.status}`);
        }
        return response.text();
      })
      .then((html) => {
        if (cancelled) return;
        setFrameSrcDoc(
          buildSandboxedArtifactSrcDoc(
            html,
            new URL(src, window.location.href).toString(),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setFrameSrcDoc(null);
      });

    return () => {
      cancelled = true;
    };
  }, [frameKey, src]);

  useEffect(() => {
    // Push-based: deck-stage's BRIDGE_SCRIPT broadcasts active-slide-
    // changed on every hashchange / data-active mutation, so we no
    // longer poll at 5 Hz forever (audit fix #1+#3 — that polling kept
    // burning CPU even on idle decks and even when src was null).
    const iframe = iframeRef.current;
    if (!iframe || !src) return;
    const unsubscribe = subscribeFrameEvent(
      iframe,
      "active-slide-changed",
      (payload) => {
        // -1 means the artifact has no [data-slide] elements (e.g. a
        // prototype). Surface that as null so the panel hides slide UI.
        const next = payload.index >= 0 ? payload.index : null;
        if (restoringSlideRef.current) {
          const target = restoreTargetSlideIdxRef.current;
          if (target == null || next === target) {
            restoringSlideRef.current = false;
            restoreTargetSlideIdxRef.current = null;
            onActiveSlideChange(next);
          }
          return;
        }
        onActiveSlideChange(next);
      },
    );
    return unsubscribe;
  }, [frameKey, onActiveSlideChange, src]);

  useEffect(() => {
    const restoreIdx = restoreTargetSlideIdxRef.current;
    if (!src || frameSrcDoc === null || restoreIdx == null) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const restore = () => {
      if (cancelled) return;
      attempts += 1;
      void requestFrameSetActiveSlide(iframeRef.current, restoreIdx).then(
        (ok) => {
          if (cancelled || ok || attempts >= 10) return;
          window.setTimeout(restore, 80);
        },
      );
    };

    const timer = window.setTimeout(restore, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [frameKey, frameSrcDoc, src]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-muted/40">
      <CanvasTopBar
        mode={mode}
        onModeChange={onModeChange}
        onRefresh={onRefresh}
      />
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {src ? (
          <iframe
            ref={iframeRef}
            key={frameKey}
            title="Canvas"
            srcDoc={frameSrcDoc ?? PLACEHOLDER_SRC}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen"
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        ) : (
          <iframe
            ref={iframeRef}
            title="Canvas placeholder"
            srcDoc={PLACEHOLDER_SRC}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen"
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        )}
        <SelectorOverlay
          active={mode === "select"}
          iframeRef={iframeRef}
          activeRelPath={activeRelPath}
          onSelect={onSelect}
        />
        <CommentLayer
          active={mode === "comment"}
          comments={comments}
          activeRelPath={activeRelPath}
          activeSlideIdx={activeSlideIdx}
          iframeRef={iframeRef}
          focusedId={focusedCommentId}
          onCreate={onCreateComment}
          onFocus={onFocusComment}
        />
        <EditLayer
          active={mode === "edit"}
          iframeRef={iframeRef}
          selectedBgId={mode === "edit" ? editSelectedBgId : null}
          onSelect={onSelectEditTarget}
        />
        <TweaksLayer
          active={mode === "tweaks"}
          iframeRef={iframeRef}
          selectedBgId={mode === "tweaks" ? tweaksSelectedBgId : null}
          onSelect={onSelectTweaksTarget}
        />
        <DrawLayer
          ref={drawLayerRef}
          active={mode === "draw"}
          tool={drawTool}
          color={drawColor}
          strokeWidth={drawStrokeWidth}
          initialShapes={drawInitialShapes}
          resetKey={drawResetKey}
          onCommit={onCommitDraws}
        />
      </div>
    </div>
  );
}
