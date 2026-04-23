import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  type TweaksStyleKey,
  type TweaksTarget,
} from "@/components/canvas/TweaksLayer";
import { BRAND_PALETTE } from "./tweaks-palette";
import {
  composeSides,
  normalizeHex,
  numericFromLength,
  parseSides,
  type Sides,
} from "./tweaks-utils";

type ApplyFn = (patch: Partial<Record<TweaksStyleKey, string | null>>) => void;

const FONT_WEIGHTS: Array<{ value: string; label: string }> = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Normal (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semibold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "Extrabold (800)" },
];

const TRANSPARENT_RE = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i;
const SIZE_RULES: Record<
  TweaksStyleKey,
  { min: number; max: number; allowNegative: boolean }
> = {
  "font-size": { min: 8, max: 240, allowNegative: false },
  "font-weight": { min: 100, max: 900, allowNegative: false },
  color: { min: 0, max: 0, allowNegative: false },
  "line-height": { min: 8, max: 320, allowNegative: false },
  "letter-spacing": { min: -8, max: 24, allowNegative: true },
  "background-color": { min: 0, max: 0, allowNegative: false },
  padding: { min: 0, max: 320, allowNegative: false },
  margin: { min: -320, max: 320, allowNegative: true },
  "border-radius": { min: 0, max: 320, allowNegative: false },
};

/**
 * Right-side inspector for Tweaks mode. Replaces the earlier generic text
 * grid with typed controls: fixed-px numeric inputs for size properties,
 * a palette-backed picker for colours, a dropdown for font-weight, and
 * 4-side compact inputs for padding / margin / border-radius. Every
 * change still commits through `onApply` (same diff-based contract), so
 * the existing undo/redo + PATCH wiring in ProjectView is unchanged.
 */
export default function TweaksPanel({
  target,
  saving,
  onApply,
  onResetAll,
  onClear,
}: {
  target: TweaksTarget | null;
  saving: boolean;
  onApply: ApplyFn;
  onResetAll: () => void;
  onClear: () => void;
}) {
  if (!target) {
    return (
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Tweaks
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Hover the canvas to highlight an element, then click to inspect
          and edit its CSS. Changes save as inline style overrides on the
          picked element. Cmd/Ctrl+Z undoes the last change.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tweaks
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetAll}
              className="text-[10px] text-muted-foreground hover:text-foreground"
              title="Remove every inline override on this node"
              disabled={saving || Object.keys(target.inline).length === 0}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="mt-1 font-mono text-xs">&lt;{target.tag}&gt;</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          data-bg-node-id="{target.bg_id}"
        </div>
      </div>

      <section className="border-b border-border px-3 py-2">
        <SectionHeader>Typography</SectionHeader>
        <div className="mt-1.5 flex flex-col gap-2">
          <SizeRow target={target} styleKey="font-size" saving={saving} onApply={onApply} />
          <FontWeightRow target={target} saving={saving} onApply={onApply} />
          <ColorRow target={target} styleKey="color" saving={saving} onApply={onApply} />
          <SizeRow target={target} styleKey="line-height" saving={saving} onApply={onApply} />
          <SizeRow target={target} styleKey="letter-spacing" saving={saving} onApply={onApply} />
        </div>
      </section>

      <section className="border-b border-border px-3 py-2">
        <SectionHeader>Box</SectionHeader>
        <div className="mt-1.5 flex flex-col gap-2">
          <ColorRow target={target} styleKey="background-color" saving={saving} onApply={onApply} />
          <SidesRow target={target} styleKey="padding" saving={saving} onApply={onApply} />
          <SidesRow target={target} styleKey="margin" saving={saving} onApply={onApply} />
          <SidesRow target={target} styleKey="border-radius" saving={saving} onApply={onApply} />
        </div>
      </section>

      <p className="px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Sizes commit as <code className="font-mono">px</code>. Clear a size
        field to drop that override; click a palette swatch or enter a hex
        to set a colour.
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-[96px] shrink-0 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function inputCls(extra?: string) {
  return cn(
    "rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]",
    "focus:outline-none focus:ring-1 focus:ring-emerald-500",
    extra,
  );
}

function SizeRow({
  target,
  styleKey,
  saving,
  onApply,
}: {
  target: TweaksTarget;
  styleKey: TweaksStyleKey;
  saving: boolean;
  onApply: ApplyFn;
}) {
  const inline = target.inline[styleKey] ?? "";
  const computed = target.computed[styleKey] ?? "";
  const [draft, setDraft] = useState(numericFromLength(inline));

  useEffect(() => {
    setDraft(numericFromLength(inline));
  }, [inline, target.bg_id, styleKey]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (inline) onApply({ [styleKey]: null });
      return;
    }
    const parsed = parseDraftLength(trimmed);
    if (parsed === null) {
      setDraft(numericFromLength(inline));
      return;
    }
    const rule = SIZE_RULES[styleKey];
    if ((!rule.allowNegative && parsed < 0) || !Number.isFinite(parsed)) {
      setDraft(numericFromLength(inline));
      return;
    }
    const clamped = clamp(parsed, rule.min, rule.max);
    const normalized = formatLengthNumber(clamped);
    const next = `${normalized}px`;
    if (next === inline) return;
    if (normalized !== trimmed) {
      setDraft(normalized);
    }
    onApply({ [styleKey]: next });
  };

  return (
    <label className="flex items-center gap-2 text-[11px]">
      <RowLabel>{styleKey}</RowLabel>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={numericFromLength(computed) || computed || "—"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => handleEnterEscape(e, commit, () => setDraft(numericFromLength(inline)))}
        disabled={saving}
        className={inputCls("min-w-0 flex-1")}
      />
      <span className="w-6 shrink-0 text-[10px] text-muted-foreground">px</span>
    </label>
  );
}

function FontWeightRow({
  target,
  saving,
  onApply,
}: {
  target: TweaksTarget;
  saving: boolean;
  onApply: ApplyFn;
}) {
  const inline = target.inline["font-weight"] ?? "";
  const computed = target.computed["font-weight"] ?? "";

  return (
    <label className="flex items-center gap-2 text-[11px]">
      <RowLabel>font-weight</RowLabel>
      <select
        value={inline}
        onChange={(e) => {
          const value = e.target.value;
          onApply({ "font-weight": value === "" ? null : value });
        }}
        disabled={saving}
        className={inputCls("min-w-0 flex-1")}
      >
        <option value="">
          {computed ? `inherit (${computed})` : "inherit"}
        </option>
        {FONT_WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorRow({
  target,
  styleKey,
  saving,
  onApply,
}: {
  target: TweaksTarget;
  styleKey: TweaksStyleKey;
  saving: boolean;
  onApply: ApplyFn;
}) {
  const inline = target.inline[styleKey] ?? "";
  const computed = target.computed[styleKey] ?? "";
  const effective = inline || computed;
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(inline);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexDraft(inline);
  }, [inline, target.bg_id, styleKey]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (
        event.target instanceof Node &&
        !popoverRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (hex: string) => {
    onApply({ [styleKey]: hex });
    setOpen(false);
  };

  const commitHex = () => {
    const trimmed = hexDraft.trim();
    if (trimmed === "") {
      if (inline) onApply({ [styleKey]: null });
      setOpen(false);
      return;
    }
    const normalized = normalizeHex(trimmed);
    if (!normalized) {
      setHexDraft(inline);
      return;
    }
    onApply({ [styleKey]: normalized });
    setOpen(false);
  };

  const clear = () => {
    if (inline) onApply({ [styleKey]: null });
    setOpen(false);
  };

  const showTransparent = !effective || TRANSPARENT_RE.test(effective);

  return (
    <div ref={popoverRef} className="relative">
      <label className="flex items-center gap-2 text-[11px]">
        <RowLabel>{styleKey}</RowLabel>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={saving}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]",
            "hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500",
            saving && "opacity-50",
          )}
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border"
            style={
              showTransparent
                ? {
                    backgroundImage:
                      "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)",
                    backgroundSize: "6px 6px",
                    backgroundPosition: "0 0, 3px 3px",
                  }
                : { backgroundColor: effective }
            }
          />
          <span className="min-w-0 flex-1 truncate text-left">
            {inline || (effective && !showTransparent ? "—" : "—")}
          </span>
        </button>
      </label>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-[240px] rounded border border-border bg-popover p-2 shadow-lg">
          {BRAND_PALETTE.map((group) => (
            <div key={group.title} className="mb-2 last:mb-0">
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </div>
              <div className="grid grid-cols-8 gap-1">
                {group.swatches.map((s) => (
                  <button
                    key={s.hex}
                    type="button"
                    onClick={() => pick(s.hex)}
                    title={`${s.name} ${s.hex}`}
                    className="h-5 w-5 rounded border border-border hover:ring-2 hover:ring-emerald-500"
                    style={{ backgroundColor: s.hex }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 flex items-center gap-1">
            <input
              type="text"
              placeholder="#ffffff"
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              onKeyDown={(e) => handleEnterEscape(e, commitHex, () => setOpen(false))}
              onBlur={commitHex}
              className={inputCls("min-w-0 flex-1")}
            />
            <button
              type="button"
              onClick={clear}
              disabled={!inline}
              className={cn(
                "rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground",
                !inline && "opacity-50 cursor-not-allowed",
              )}
              title="Remove this inline override"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidesRow({
  target,
  styleKey,
  saving,
  onApply,
}: {
  target: TweaksTarget;
  styleKey: TweaksStyleKey;
  saving: boolean;
  onApply: ApplyFn;
}) {
  const inline = target.inline[styleKey] ?? "";
  const computed = target.computed[styleKey] ?? "";
  const initial = numericSidesFrom(inline || computed);
  const [sides, setSides] = useState<Sides>(initial);

  useEffect(() => {
    setSides(numericSidesFrom(inline || computed));
  }, [inline, computed, target.bg_id, styleKey]);

  const commitSide = (side: keyof Sides) => (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (trimmed !== "" && !/^-?\d*\.?\d+$/.test(trimmed)) {
      // Reject non-numeric; drop back to the last accepted numeric.
      setSides((prev) => ({ ...prev, [side]: prev[side] }));
      return;
    }
    const next: Sides = { ...sides, [side]: trimmed };
    setSides(next);
    const allEmpty =
      !next.top && !next.right && !next.bottom && !next.left;
    if (allEmpty) {
      if (inline) onApply({ [styleKey]: null });
      return;
    }
    const withUnit: Sides = {
      top: next.top === "" ? "0px" : `${next.top}px`,
      right: next.right === "" ? "0px" : `${next.right}px`,
      bottom: next.bottom === "" ? "0px" : `${next.bottom}px`,
      left: next.left === "" ? "0px" : `${next.left}px`,
    };
    const shorthand = composeSides(withUnit);
    if (shorthand && shorthand !== inline) {
      onApply({ [styleKey]: shorthand });
    } else if (!shorthand && inline) {
      onApply({ [styleKey]: null });
    }
  };

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <RowLabel>{styleKey}</RowLabel>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <SideInput title="top" value={sides.top} onCommit={commitSide("top")} disabled={saving} />
        <SideInput title="right" value={sides.right} onCommit={commitSide("right")} disabled={saving} />
        <SideInput title="bottom" value={sides.bottom} onCommit={commitSide("bottom")} disabled={saving} />
        <SideInput title="left" value={sides.left} onCommit={commitSide("left")} disabled={saving} />
      </div>
      <span className="w-6 shrink-0 text-[10px] text-muted-foreground">px</span>
    </div>
  );
}

function SideInput({
  title,
  value,
  onCommit,
  disabled,
}: {
  title: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      title={title}
      aria-label={title}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) =>
        handleEnterEscape(
          e,
          () => onCommit(draft),
          () => setDraft(value),
        )
      }
      disabled={disabled}
      className={inputCls(
        "w-0 min-w-0 flex-1 text-center text-[10px] px-1",
      )}
    />
  );
}

function handleEnterEscape(
  e: ReactKeyboardEvent<HTMLInputElement>,
  onEnter: () => void,
  onEscape: () => void,
) {
  if (e.key === "Enter") {
    e.preventDefault();
    onEnter();
    (e.currentTarget as HTMLInputElement).blur();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    onEscape();
    (e.currentTarget as HTMLInputElement).blur();
  }
}

function numericSidesFrom(raw: string): Sides {
  const parsed = parseSides(raw);
  return {
    top: numericFromLength(parsed.top),
    right: numericFromLength(parsed.right),
    bottom: numericFromLength(parsed.bottom),
    left: numericFromLength(parsed.left),
  };
}

function parseDraftLength(value: string): number | null {
  const match = value.trim().match(/^(-?\d*\.?\d+)(?:px)?$/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatLengthNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
