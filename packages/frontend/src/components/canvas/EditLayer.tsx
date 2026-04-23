import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

export interface EditTarget {
  bg_id: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
}

export default function EditLayer({
  active,
  iframeRef,
  selectedBgId,
  onSelect,
}: {
  active: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  selectedBgId: string | null;
  onSelect: (target: EditTarget | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  // Keep the persistent selection box aligned with the element as the
  // iframe resizes / reflows. Stops on unselect.
  useEffect(() => {
    if (!selectedBgId) {
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
      const el = doc.querySelector(
        `[data-bg-node-id="${cssEscape(selectedBgId)}"]`,
      );
      if (!(el instanceof HTMLElement)) {
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
  }, [iframeRef, selectedBgId]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) {
      setHoverRect(null);
      return;
    }
    const overlayRect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - overlayRect.left;
    const relY = e.clientY - overlayRect.top;
    const doc = readDoc(iframeRef.current);
    if (!doc) {
      setHoverRect(null);
      return;
    }
    try {
      // See SelectorOverlay.tsx — cross-realm `instanceof HTMLElement`
      // is always false for iframe nodes. Null-check instead.
      const el = doc.elementFromPoint(relX, relY);
      const target = el ? el.closest("[data-bg-node-id]") : null;
      if (!target) {
        setHoverRect(null);
        return;
      }
      const next = target.getBoundingClientRect();
      setHoverRect((prev) => (rectEqual(prev, next) ? prev : next));
    } catch {
      setHoverRect(null);
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!active || !overlayRef.current) return;
    if (e.target !== overlayRef.current) return;

    const overlayRect = overlayRef.current.getBoundingClientRect();
    const relX = e.clientX - overlayRect.left;
    const relY = e.clientY - overlayRect.top;
    const doc = readDoc(iframeRef.current);
    if (!doc) return;

    const el = doc.elementFromPoint(relX, relY);
    const target = el ? el.closest("[data-bg-node-id]") : null;
    if (!target) {
      onSelect(null);
      return;
    }

    const bg_id = target.getAttribute("data-bg-node-id") ?? "";
    const attributes: Record<string, string> = {};
    for (const attr of Array.from(target.attributes)) {
      attributes[attr.name] = attr.value;
    }
    onSelect({
      bg_id,
      tag: target.tagName.toLowerCase(),
      text: target.textContent ?? "",
      attributes,
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
      {hoverRect && (
        <div
          className="absolute pointer-events-none border-2 border-blue-500/80 bg-blue-500/10"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}
      {selectedRect && (
        <div
          className="absolute pointer-events-none border-2 border-orange-500 bg-orange-500/10"
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

function readDoc(iframe: HTMLIFrameElement | null): Document | null {
  if (!iframe) return null;
  try {
    return iframe.contentDocument;
  } catch {
    return null;
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

function cssEscape(value: string): string {
  // `CSS.escape` exists in all target browsers, but guard anyway so the
  // test environment (jsdom-free) doesn't blow up.
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
