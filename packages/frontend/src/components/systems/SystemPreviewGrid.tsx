import { Pencil } from "lucide-react";
import PreviewIframe from "./PreviewIframe";
import { Button } from "@/components/ui/button";

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

export default function SystemPreviewGrid({
  systemId,
  onEditColors,
  previewRefreshKey = 0,
}: {
  systemId: string;
  onEditColors?: () => void;
  previewRefreshKey?: number;
}) {
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
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            }}
          >
            {grp.items.map((it) => (
              <article
                key={it.id}
                className="rounded-xl border border-border bg-card p-4 hover:shadow-app-2 transition-shadow"
              >
                <div className="mb-3">
                  <PreviewIframe
                    systemId={systemId}
                    path={`preview/${it.id}.html`}
                    title={it.title}
                    refreshKey={previewRefreshKey}
                  />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{it.title}</div>
                    {it.desc && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {it.desc}
                      </div>
                    )}
                  </div>
                  {grp.group === "Colors" && onEditColors ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={onEditColors}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Preview content streams from{" "}
        <code className="font-mono">
          GET /api/design-systems/:id/files/preview/:name
        </code>
        .
      </p>
    </div>
  );
}
