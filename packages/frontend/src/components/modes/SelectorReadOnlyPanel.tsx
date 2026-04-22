import type { SelectedNode } from "@/types/project";

export default function SelectorReadOnlyPanel({
  selection,
}: {
  selection: SelectedNode | null;
}) {
  if (!selection) {
    return (
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Select
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Click an element in the canvas to inspect its computed styles.
        </p>
        <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
          Read-only in Phase 1. Editable CSS fields ship in Phase 3 (Tweaks).
        </p>
      </div>
    );
  }

  const groups: Array<{ title: string; keys: string[] }> = [
    {
      title: "Typography",
      keys: [
        "font-family",
        "font-size",
        "font-weight",
        "color",
        "line-height",
        "letter-spacing",
      ],
    },
    { title: "Size", keys: ["width", "height"] },
    {
      title: "Box",
      keys: ["padding", "margin", "border", "border-radius", "background"],
    },
  ];

  return (
    <div className="p-3 overflow-y-auto">
      <div className="px-1 pb-2 border-b border-border mb-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Selector
        </div>
        <div className="text-xs font-mono mt-0.5 truncate">
          {selection.nodeId}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate font-mono">
          {selection.file}
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.title} className="mb-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1">
            {g.title}
          </div>
          <div className="rounded-md border border-border bg-muted/40 overflow-hidden">
            {g.keys.map((k, i) => (
              <Row
                key={k}
                k={k}
                v={selection.computed[k] ?? "—"}
                last={i === g.keys.length - 1}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="text-[10px] text-muted-foreground px-1 mt-3 leading-relaxed">
        Read-only in Phase 1. Editable CSS fields ship in Phase 3 (Tweaks).
      </p>
    </div>
  );
}

function Row({ k, v, last }: { k: string; v: string; last: boolean }) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] " +
        (last ? "" : "border-b border-border")
      }
    >
      <span className="text-muted-foreground font-mono">{k}</span>
      <span
        className="font-mono truncate max-w-[170px] text-right"
        title={v}
      >
        {v}
      </span>
    </div>
  );
}
