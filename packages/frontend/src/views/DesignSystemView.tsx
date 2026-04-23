import { useEffect, useState } from "react";
import type { DesignSystemDetail } from "@bg/shared";
import { useParams } from "react-router-dom";
import { getDesignSystem } from "@/api/design-system";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";

export default function DesignSystemView({
  systemIdOverride,
}: {
  systemIdOverride?: string;
} = {}) {
  const { id: paramId } = useParams();
  const id = systemIdOverride ?? paramId;
  const [system, setSystem] = useState<DesignSystemDetail | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    void getDesignSystem(id).then((next) => {
      if (!cancelled) {
        setSystem(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!system || !id) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-sm text-muted-foreground">
          Loading design system...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Design system
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {system.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            {system.description ??
              "Bundled local design system. Files are available to sessions as project context."}
          </p>

          <dl className="mt-8 grid gap-4 text-sm md:grid-cols-2">
            <InfoRow label="Status" value={system.status} />
            <InfoRow
              label="Template"
              value={system.is_template ? "Yes" : "No"}
            />
            <InfoRow label="Source" value={system.source_type ?? "manual"} />
            <InfoRow label="Directory" value={system.dir_path} />
            <InfoRow label="SKILL.md" value={system.skill_md_path ?? "None"} />
            <InfoRow
              label="Tokens CSS"
              value={system.tokens_css_path ?? "None"}
            />
          </dl>
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl">
          <SystemPreviewGrid systemId={id} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 break-all font-mono text-xs text-foreground">
        {value}
      </div>
    </div>
  );
}
