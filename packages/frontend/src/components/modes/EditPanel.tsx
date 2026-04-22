import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { EditTarget } from "@/components/canvas/EditLayer";

interface AttrRow {
  key: string;
  value: string;
}

interface EditPatch {
  text?: string;
  attributes?: Record<string, string | null>;
}

export default function EditPanel({
  target,
  saving,
  onSave,
  onClear,
}: {
  target: EditTarget | null;
  saving: boolean;
  onSave: (patch: EditPatch) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const [attrRows, setAttrRows] = useState<AttrRow[]>([]);

  useEffect(() => {
    if (!target) {
      setText("");
      setAttrRows([]);
      return;
    }
    setText(target.text);
    setAttrRows(
      Object.entries(target.attributes)
        .filter(([k]) => k !== "data-bg-node-id")
        .map(([key, value]) => ({ key, value })),
    );
  }, [target]);

  if (!target) {
    return (
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Edit
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Hover over the canvas to highlight editable elements, then click one
          to inspect and edit it. Only elements with{" "}
          <code className="font-mono">data-bg-node-id</code> are editable.
        </p>
      </div>
    );
  }

  const handleSave = () => {
    const originalAttrs: Record<string, string> = { ...target.attributes };
    delete originalAttrs["data-bg-node-id"];

    const attrDiff: Record<string, string | null> = {};
    const currentKeys = new Set<string>();
    for (const row of attrRows) {
      const key = row.key.trim();
      if (!key) continue;
      if (key === "data-bg-node-id") continue;
      currentKeys.add(key);
      if (originalAttrs[key] !== row.value) {
        attrDiff[key] = row.value;
      }
    }
    for (const origKey of Object.keys(originalAttrs)) {
      if (!currentKeys.has(origKey)) {
        attrDiff[origKey] = null;
      }
    }

    const patch: EditPatch = {};
    if (text !== target.text) patch.text = text;
    if (Object.keys(attrDiff).length > 0) patch.attributes = attrDiff;

    if (patch.text === undefined && patch.attributes === undefined) {
      return; // nothing changed
    }
    onSave(patch);
  };

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Edit
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        <div className="mt-1 font-mono text-xs">&lt;{target.tag}&gt;</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          data-bg-node-id="{target.bg_id}"
        </div>
      </div>

      <section className="px-3 py-2">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Text content
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 w-full resize-none rounded border border-border bg-background p-1.5 text-xs font-mono"
        />
      </section>

      <section className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Attributes
          </span>
          <button
            type="button"
            onClick={() => setAttrRows((prev) => [...prev, { key: "", value: "" }])}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            + Add
          </button>
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {attrRows.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No attributes.</p>
          )}
          {attrRows.map((row, idx) => (
            <div key={idx} className="flex gap-1">
              <input
                value={row.key}
                onChange={(e) => {
                  const next = attrRows.slice();
                  next[idx] = { ...next[idx], key: e.target.value };
                  setAttrRows(next);
                }}
                placeholder="name"
                className="min-w-0 flex-1 rounded border border-border bg-background p-1 text-[11px] font-mono"
              />
              <input
                value={row.value}
                onChange={(e) => {
                  const next = attrRows.slice();
                  next[idx] = { ...next[idx], value: e.target.value };
                  setAttrRows(next);
                }}
                placeholder="value"
                className="min-w-0 flex-1 rounded border border-border bg-background p-1 text-[11px] font-mono"
              />
              <button
                type="button"
                onClick={() => setAttrRows(attrRows.filter((_, i) => i !== idx))}
                className="px-1 text-muted-foreground hover:text-foreground"
                aria-label="Remove attribute"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "w-full rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white",
            "hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
