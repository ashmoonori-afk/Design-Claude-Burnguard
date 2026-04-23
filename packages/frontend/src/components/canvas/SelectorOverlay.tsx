import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  requestFrameRectForSelector,
  requestFrameSelectAtPoint,
  type FrameRect,
} from "./frame-bridge";
import type { SelectedNode } from "@/types/project";

export default function SelectorOverlay({
  active,
  iframeRef,
  activeRelPath,
  onSelect,
}: {
  active: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeRelPath: string | null;
  onSelect: (selection: SelectedNode | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);
  const [hoverRect, setHoverRect] = useState<FrameRect | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<FrameRect | null>(null);

  useEffect(() => {
    if (!active) {
      setHoverRect(null);
      setSelectedKey(null);
      setSelectedRect(null);
    }
  }, [active]);

  useEffect(() => {
    if (!selectedKey) {
      setSelectedRect(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const rect = await requestFrameRectForSelector(
        iframeRef.current,
        selectedKey,
      );
      if (!alive) return;
      setSelectedRect((prev) => (rectEqual(prev, rect) ? prev : rect));
    };
    void tick();
    const id = window.setInterval(tick, 200);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [iframeRef, selectedKey]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) {
      setHoverRect(null);
      return;
    }
    const rect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const seq = ++requestSeqRef.current;
    void requestFrameSelectAtPoint(iframeRef.current, relX, relY).then((hit) => {
      if (requestSeqRef.current !== seq) return;
      setHoverRect((prev) =>
        rectEqual(prev, hit?.rect ?? null) ? prev : (hit?.rect ?? null),
      );
    });
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) return;
    if (e.target !== overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    void requestFrameSelectAtPoint(iframeRef.current, relX, relY).then((hit) => {
      if (!hit?.selector || !hit.rect) {
        setSelectedKey(null);
        setSelectedRect(null);
        onSelect(null);
        return;
      }
      setSelectedKey(hit.selector);
      setSelectedRect(hit.rect);
      onSelect({
        nodeId: hit.selector,
        rect: {
          x: hit.rect.left,
          y: hit.rect.top,
          w: hit.rect.width,
          h: hit.rect.height,
        },
        computed: hit.computed,
        file: activeRelPath ?? "",
      });
    });
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverRect(null)}
      onClick={handleClick}
    >
      {active && hoverRect && (
        <div
          className="absolute pointer-events-none border-2 border-sky-400/80 bg-sky-400/10"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}
      {active && selectedRect && (
        <div
          className="absolute pointer-events-none border-2 border-sky-500 bg-sky-500/10"
          style={{
            left: selectedRect.left,
            top: selectedRect.top,
            width: selectedRect.width,
            height: selectedRect.height,
          }}
        />
      )}
    </div>
  );
}

function rectEqual(a: FrameRect | null, b: FrameRect | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}
