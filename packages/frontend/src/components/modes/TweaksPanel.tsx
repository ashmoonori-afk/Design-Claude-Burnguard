import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TWEAKS_STYLE_KEYS,
  type TweaksStyleKey,
  type TweaksTarget,
} from "@/components/canvas/TweaksLayer";

const GROUPS: Array<{ title: string; keys: TweaksStyleKey[] }> = [
  {
    title: "Typography",
    keys: ["font-size", "font-weight", "color", "line-height", "letter-spacing"],
  },
  { title: "Box", keys: ["background", "padding", "margin", "border-radius"] },
];

/**
 * Right-side inspector for Tweaks mode. Shows the computed value as the
 * placeholder and the current inline override as the editable value. On
 * blur (or Enter), emits the diff against the initial inline state up so
 * `ProjectView` can PATCH + record an undo frame.
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
  onApply: (patch: Partial<Record<TweaksStyleKey, string | null>>) => void;
  onResetAll: () => void;
  onClear: () => void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<TweaksStyleKey, string>>>(
    {},
  );

  useEffect(() => {
    setDrafts(target?.inline ?? {});
  }, [target?.bg_id, target?.inline]);

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

  const commit = (key: TweaksStyleKey, rawValue: string) => {
    const next = rawValue.trim();
    const prev = target.inline[key] ?? "";
    if (next === prev) return;
    // Empty draft → remove this override and fall back to computed.
    if (next.length === 0) {
      onApply({ [key]: null });
    } else {
      onApply({ [key]: next });
    }
  };

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

      {GROUPS.map((group) => (
        <section key={group.title} className="border-b border-border px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {group.title}
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {group.keys.map((key) => (
              <Row
                key={key}
                label={key}
                placeholder={target.computed[key] ?? ""}
                value={drafts[key] ?? ""}
                committed={target.inline[key] ?? ""}
                saving={saving}
                onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: v }))}
                onCommit={(v) => commit(key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Values merge into the node's <code className="font-mono">style</code>
        attribute. Leave a field empty to drop the override.
      </p>
    </div>
  );
}

function Row({
  label,
  placeholder,
  value,
  committed,
  saving,
  onChange,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  /** Last server-committed inline value — what Escape restores to. */
  committed: string;
  saving: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-[90px] shrink-0 font-mono text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder || "—"}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(e.currentTarget.value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            // Restore the draft to the last committed inline value so
            // the user's in-progress typing is discarded. Blur fires
            // onCommit(committed); commit() no-ops because next === prev.
            onChange(committed);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        disabled={saving}
        className={cn(
          "min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono",
          "focus:outline-none focus:ring-1 focus:ring-emerald-500",
        )}
      />
    </label>
  );
}
