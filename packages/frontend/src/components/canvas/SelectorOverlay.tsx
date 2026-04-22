import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import type { SelectedNode } from "@/types/project";

const READ_STYLE_KEYS = [
  "font-family",
  "font-size",
  "font-weight",
  "color",
  "line-height",
  "letter-spacing",
  "width",
  "height",
  "padding",
  "margin",
  "border",
  "border-radius",
  "background",
] as const;

/**
 * Hover-to-highlight + click-to-inspect selector overlay. Uses the iframe's
 * contentDocument for real element hit-testing and getComputedStyle for the
 * read-only property panel. Works on any project artifact — nodes don't need
 * a `data-bg-node-id`; it's preferred when present but falls back to `id` or
 * tag name so plain HTML still selects cleanly.
 */
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
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active) {
      setHoverRect(null);
      setSelectedKey(null);
      setSelectedRect(null);
    }
  }, [active]);

  // Keep the persistent box aligned with the selected element as the iframe
  // reflows. Mirrors EditLayer's polling approach so both overlays behave
  // identically in deck and prototype projects.
  useEffect(() => {
    if (!selectedKey) {
      setSelectedRect(null);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const doc = readDoc(iframeRef.current);
      if (!doc) {
        setSelectedRect(null);
        return;
      }
      const el = findByKey(doc, selectedKey);
      if (!el) {
        setSelectedRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setSelectedRect((prev) => (rectEqual(prev, rect) ? prev : rect));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [iframeRef, selectedKey]);

  const pickTarget = (e: MouseEvent<HTMLDivElement>): HTMLElement | null => {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const doc = readDoc(iframeRef.current);
    if (!doc) return null;
    try {
      const el = doc.elementFromPoint(relX, relY);
      return el instanceof HTMLElement ? el : null;
    } catch {
      return null;
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!active) {
      setHoverRect(null);
      return;
    }
    const el = pickTarget(e);
    if (!el) {
      setHoverRect(null);
      return;
    }
    const next = el.getBoundingClientRect();
    setHoverRect((prev) => (rectEqual(prev, next) ? prev : next));
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) return;
    if (e.target !== overlayRef.current) return;
    const el = pickTarget(e);
    if (!el) {
      setSelectedKey(null);
      onSelect(null);
      return;
    }
    const key = deriveKey(el);
    const rect = el.getBoundingClientRect();
    const view = readView(iframeRef.current);
    const computed = view ? readComputed(view, el) : {};
    setSelectedKey(key);
    setSelectedRect(rect);
    onSelect({
      nodeId: key,
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      computed,
      file: activeRelPath ?? "",
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

function deriveKey(el: HTMLElement): string {
  const bg = el.getAttribute("data-bg-node-id");
  if (bg) return `[data-bg-node-id="${bg}"]`;
  if (el.id) return `#${el.id}`;
  return el.tagName.toLowerCase();
}

function findByKey(doc: Document, key: string): HTMLElement | null {
  try {
    const el = doc.querySelector(key);
    return el instanceof HTMLElement ? el : null;
  } catch {
    return null;
  }
}

function readDoc(iframe: HTMLIFrameElement | null): Document | null {
  if (!iframe) return null;
  try {
    return iframe.contentDocument;
  } catch {
    return null;
  }
}

function readView(iframe: HTMLIFrameElement | null): Window | null {
  if (!iframe) return null;
  try {
    return iframe.contentWindow;
  } catch {
    return null;
  }
}

function readComputed(view: Window, el: HTMLElement): Record<string, string> {
  try {
    const style = view.getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const key of READ_STYLE_KEYS) {
      out[key] = style.getPropertyValue(key).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function rectEqual(a: DOMRect | null, b: DOMRect): boolean {
  if (!a) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}
