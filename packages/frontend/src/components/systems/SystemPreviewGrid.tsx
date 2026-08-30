import { Pencil } from "lucide-react";
import PreviewIframe from "./PreviewIframe";
import { Button } from "@/components/ui/button";

interface PreviewSection {
  group: string;
  items: Array<{ id: string; title: string; desc?: string }>;
}

const SECTIONS: PreviewSection[] = [
  {
    group: "브랜드",
    items: [
      { id: "brand-logos", title: "브랜드 로고", desc: "공식 로고 조합 6개" },
      { id: "brand-icons", title: "브랜드 아이콘", desc: "Lucide 1.5px 스트로크" },
    ],
  },
  {
    group: "색상",
    items: [
      { id: "colors-brand", title: "브랜드 색상" },
      { id: "colors-neutrals", title: "중립 색상" },
      { id: "colors-ramps", title: "전체 색상 단계" },
      { id: "colors-semantic", title: "의미 색상" },
      { id: "colors-charts", title: "차트 팔레트" },
    ],
  },
  {
    group: "타이포그래피",
    items: [
      { id: "type-display", title: "디스플레이" },
      { id: "type-headings", title: "제목" },
      { id: "type-body", title: "본문" },
    ],
  },
  {
    group: "기초",
    items: [
      { id: "spacing", title: "간격" },
      { id: "radii-shadows", title: "모서리 반경과 그림자" },
    ],
  },
  {
    group: "컴포넌트",
    items: [
      { id: "components-buttons", title: "버튼" },
      { id: "components-cards", title: "카드" },
      { id: "components-forms", title: "폼" },
      { id: "components-badges-table", title: "배지와 표" },
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
                  {grp.group === "색상" && onEditColors ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={onEditColors}
                    >
                      <Pencil className="h-3 w-3" />
                      편집
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted-foreground">
        미리보기 콘텐츠는 다음 경로에서 제공돼요:{" "}
        <code className="font-mono">
          GET /api/design-systems/:id/files/preview/:name
        </code>
        .
      </p>
    </div>
  );
}
