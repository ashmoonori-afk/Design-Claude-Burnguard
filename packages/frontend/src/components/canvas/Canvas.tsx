import { useRef } from "react";
import type { Comment } from "@bg/shared";
import CanvasTopBar from "./CanvasTopBar";
import CommentLayer from "./CommentLayer";
import SelectorOverlay from "./SelectorOverlay";
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
  focusedCommentId,
  onCreateComment,
  onFocusComment,
}: {
  mode: CanvasMode | null;
  src?: string | null;
  frameKey?: string;
  onModeChange: (m: CanvasMode | null) => void;
  onSelect: (s: SelectedNode) => void;
  onRefresh: () => void;
  comments: Comment[];
  activeRelPath: string | null;
  focusedCommentId: string | null;
  onCreateComment: (input: {
    x_pct: number;
    y_pct: number;
    node_selector: string;
    slide_index: number | null;
  }) => void;
  onFocusComment: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
            src={src}
            sandbox="allow-scripts allow-same-origin"
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        ) : (
          <iframe
            ref={iframeRef}
            title="Canvas placeholder"
            srcDoc={PLACEHOLDER_SRC}
            sandbox="allow-scripts allow-same-origin"
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        )}
        <SelectorOverlay active={mode === "select"} onSelect={onSelect} />
        <CommentLayer
          active={mode === "comment"}
          comments={comments}
          activeRelPath={activeRelPath}
          iframeRef={iframeRef}
          focusedId={focusedCommentId}
          onCreate={onCreateComment}
          onFocus={onFocusComment}
        />
      </div>
    </div>
  );
}
