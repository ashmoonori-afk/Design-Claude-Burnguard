import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

/**
 * Properties surfaced to the Tweaks inspector. Kept to a tight CSS subset
 * so the panel stays usable — font/box/colour fundamentals. Adding more
 * later is fine but reach-y properties (transforms, grid template) deserve
 * their own panel.
 */
export const TWEAKS_STYLE_KEYS = [
  "font-size",
  "font-weight",
  "color",
  "line-height",
  "letter-spacing",
  "background-color",
  "padding",
  "margin",
  "border-radius",
] as const;

export type TweaksStyleKey = (typeof TWEAKS_STYLE_KEYS)[number];

export interface TweaksTarget {
  bg_id: string;
  tag: string;
  computed: Partial<Record<TweaksStyleKey, string>>;
  inline: Partial<Record<TweaksStyleKey, string>>;
}

/**
 * Hover-to-highlight + click-to-lock overlay for Tweaks mode. Only
 * elements with `data-bg-node-id` are selectable — same contract as Edit
 * mode — so style changes can PATCH to a stable anchor. Sky-emerald theme
 * distinguishes it from Edit (orange) and Select (sky).
 */
export default function TweaksLayer({
  active,
  iframeRef,
  selectedBgId,
  onSelect,
}: {
  active: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  selectedBgId: string | null;
  onSelect: (target: TweaksTarget | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active) {
      setHoverRect(null);
      setSelectedRect(null);
    }
  }, [active]);

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
    const view = readView(iframeRef.current);
    if (!doc || !view) return;

    const el = doc.elementFromPoint(relX, relY);
    const target = el ? el.closest("[data-bg-node-id]") : null;
    if (!target) {
      onSelect(null);
      return;
    }

    const bg_id = target.getAttribute("data-bg-node-id") ?? "";
    const computed: Partial<Record<TweaksStyleKey, string>> = {};
    const style = view.getComputedStyle(target);
    for (const key of TWEAKS_STYLE_KEYS) {
      computed[key] = style.getPropertyValue(key).trim();
    }
    const inline = parseInlineStyle(target.getAttribute("style") ?? "");
    onSelect({
      bg_id,
      tag: target.tagName.toLowerCase(),
      computed,
      inline,
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
          className="absolute pointer-events-none border-2 border-emerald-500/70 bg-emerald-500/10"
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
          className="absolute pointer-events-none border-2 border-emerald-500 bg-emerald-500/15"
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

function parseInlineStyle(raw: string): Partial<Record<TweaksStyleKey, string>> {
  const out: Partial<Record<TweaksStyleKey, string>> = {};
  const known = new Set<string>(TWEAKS_STYLE_KEYS);
  for (const decl of raw.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!key || !value) continue;
    if (known.has(key)) {
      out[key as TweaksStyleKey] = value;
    }
  }
  return out;
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
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
