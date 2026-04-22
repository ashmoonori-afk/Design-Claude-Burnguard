import type { Comment } from "@bg/shared";
import type { CanvasMode } from "./types";
import type { SelectedNode } from "@/types/project";
import type { EditTarget } from "@/components/canvas/EditLayer";
import type { DrawTool } from "@/components/canvas/DrawLayer";
import type {
  TweaksStyleKey,
  TweaksTarget,
} from "@/components/canvas/TweaksLayer";
import CommentPanel from "./CommentPanel";
import DrawPanel from "./DrawPanel";
import EditPanel from "./EditPanel";
import SelectorReadOnlyPanel from "./SelectorReadOnlyPanel";
import TweaksPanel from "./TweaksPanel";

/**
 * Right-side mode pane. Renders nothing when no mode is active so the canvas
 * uses the full width; the iframe is then directly interactive (copy text,
 * click links, right-click, etc.).
 */
export default function ModePanel({
  mode,
  selection,
  comments,
  activeRelPath,
  activeSlideIdx,
  focusedCommentId,
  onFocusComment,
  onUpdateCommentBody,
  onToggleCommentResolved,
  editTarget,
  editSaving,
  onSaveEdit,
  onClearEdit,
  tweaksTarget,
  tweaksSaving,
  onApplyTweak,
  onResetTweaks,
  onClearTweaks,
  drawTool,
  drawColor,
  drawStrokeWidth,
  drawHasShapes,
  onChangeDrawTool,
  onChangeDrawColor,
  onChangeDrawWidth,
  onUndoDraw,
  onRedoDraw,
  onClearDraw,
}: {
  mode: CanvasMode | null;
  selection: SelectedNode | null;
  comments: Comment[];
  activeRelPath: string | null;
  activeSlideIdx: number | null;
  focusedCommentId: string | null;
  onFocusComment: (id: string | null) => void;
  onUpdateCommentBody: (id: string, body: string) => void;
  onToggleCommentResolved: (id: string, resolved: boolean) => void;
  editTarget: EditTarget | null;
  editSaving: boolean;
  onSaveEdit: (patch: {
    text?: string;
    attributes?: Record<string, string | null>;
  }) => void;
  onClearEdit: () => void;
  tweaksTarget: TweaksTarget | null;
  tweaksSaving: boolean;
  onApplyTweak: (patch: Partial<Record<TweaksStyleKey, string | null>>) => void;
  onResetTweaks: () => void;
  onClearTweaks: () => void;
  drawTool: DrawTool;
  drawColor: string;
  drawStrokeWidth: number;
  drawHasShapes: boolean;
  onChangeDrawTool: (t: DrawTool) => void;
  onChangeDrawColor: (c: string) => void;
  onChangeDrawWidth: (w: number) => void;
  onUndoDraw: () => void;
  onRedoDraw: () => void;
  onClearDraw: () => void;
}) {
  if (!mode) return null;

  return (
    <aside className="w-[320px] shrink-0 border-l border-border bg-background flex flex-col min-h-0">
      {mode === "select" && <SelectorReadOnlyPanel selection={selection} />}
      {mode === "tweaks" && (
        <TweaksPanel
          target={tweaksTarget}
          saving={tweaksSaving}
          onApply={onApplyTweak}
          onResetAll={onResetTweaks}
          onClear={onClearTweaks}
        />
      )}
      {mode === "comment" && (
        <CommentPanel
          comments={comments}
          activeRelPath={activeRelPath}
          activeSlideIdx={activeSlideIdx}
          focusedId={focusedCommentId}
          onFocus={onFocusComment}
          onUpdateBody={onUpdateCommentBody}
          onToggleResolved={onToggleCommentResolved}
        />
      )}
      {mode === "edit" && (
        <EditPanel
          target={editTarget}
          saving={editSaving}
          onSave={onSaveEdit}
          onClear={onClearEdit}
        />
      )}
      {mode === "draw" && (
        <DrawPanel
          tool={drawTool}
          color={drawColor}
          strokeWidth={drawStrokeWidth}
          hasShapes={drawHasShapes}
          onChangeTool={onChangeDrawTool}
          onChangeColor={onChangeDrawColor}
          onChangeWidth={onChangeDrawWidth}
          onUndo={onUndoDraw}
          onRedo={onRedoDraw}
          onClear={onClearDraw}
        />
      )}
    </aside>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
