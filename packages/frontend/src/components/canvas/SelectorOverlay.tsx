import { useEffect, useState } from "react";
import type { SelectedNode } from "@/types/project";

/**
 * FE-S1-05 placeholder overlay.
 * Real implementation subscribes to postMessage from the sandboxed iframe
 * (contract frozen in BE-S4-08 / parent-iframe payload). For the static
 * layout, clicking anywhere simulates a selection on a placeholder node.
 */
export default function SelectorOverlay({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (s: SelectedNode) => void;
}) {
  const [box, setBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    if (!active) setBox(null);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      onClick={(e) => {
        const host = e.currentTarget as HTMLElement;
        const rect = host.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const w = 320;
        const h = 96;
        const b = {
          x: Math.max(0, cx - w / 2),
          y: Math.max(0, cy - h / 2),
          w,
          h,
        };
        setBox(b);
        onSelect({
          nodeId: "placeholder-hero-title",
          rect: b,
          computed: {
            "font-family": "Zen Serif, Pretendard Variable",
            "font-size": "140px",
            "font-weight": "800",
            color: "#FFFFFF",
            "line-height": "0.95",
            "letter-spacing": "-0.03em",
            width: `${b.w}px`,
            height: `${b.h}px`,
            padding: "0px",
            margin: "0px",
            border: "0px",
            "border-radius": "0px",
            background: "transparent",
          },
          file: "deck.html",
        });
      }}
    >
      {box && (
        <div
          className="absolute border-2 border-accent pointer-events-none"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
          }}
        />
      )}
    </div>
  );
}
