interface PreviewSection {
  group: string;
  items: Array<{ id: string; title: string; desc?: string }>;
}

const SECTIONS: PreviewSection[] = [
  {
    group: "Brand",
    items: [
      { id: "brand-logos", title: "Brand Logos", desc: "Six official lockups" },
      { id: "brand-icons", title: "Brand Icons", desc: "Lucide 1.5px stroke" },
    ],
  },
  {
    group: "Colors",
    items: [
      { id: "colors-brand", title: "Brand Colors" },
      { id: "colors-neutrals", title: "Neutrals" },
      { id: "colors-ramps", title: "Full Ramps" },
      { id: "colors-semantic", title: "Semantic" },
      { id: "colors-charts", title: "Chart Palette" },
    ],
  },
  {
    group: "Typography",
    items: [
      { id: "type-display", title: "Display" },
      { id: "type-headings", title: "Headings" },
      { id: "type-body", title: "Body" },
    ],
  },
  {
    group: "Foundations",
    items: [
      { id: "spacing", title: "Spacing" },
      { id: "radii-shadows", title: "Radii & Shadows" },
    ],
  },
  {
    group: "Components",
    items: [
      { id: "components-buttons", title: "Buttons" },
      { id: "components-cards", title: "Cards" },
      { id: "components-forms", title: "Forms" },
      { id: "components-badges-table", title: "Badges & Table" },
    ],
  },
];

export default function SystemPreviewGrid() {
  return (
    <div className="px-8 py-6 space-y-8">
      {SECTIONS.map((grp) => (
        <section key={grp.group}>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            {grp.group}
          </h2>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {grp.items.map((it) => (
              <article
                key={it.id}
                className="rounded-xl border border-border bg-card p-4 hover:shadow-app-2 transition-shadow"
              >
                <div className="aspect-video rounded-md bg-muted mb-3 grid place-items-center text-[11px] font-mono text-muted-foreground">
                  preview/{it.id}.html
                </div>
                <div className="text-sm font-medium">{it.title}</div>
                {it.desc && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.desc}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Preview HTMLs render from the file content route in Sprint 4. Phase 1 shows the structure only.
      </p>
    </div>
  );
}
