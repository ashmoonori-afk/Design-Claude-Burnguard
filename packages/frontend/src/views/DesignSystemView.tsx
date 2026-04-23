import { useEffect, useState } from "react";
import type { DesignSystemDetail } from "@bg/shared";
import { AlertTriangle } from "lucide-react";
import { useParams } from "react-router-dom";
import { getDesignSystem } from "@/api/design-system";
import SystemPreviewGrid from "@/components/systems/SystemPreviewGrid";
import { Badge } from "@/components/ui/badge";

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

          {system.status === "draft" ? (
            <DraftValidationCard system={system} />
          ) : null}

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

function DraftValidationCard({
  system,
}: {
  system: DesignSystemDetail;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
              Issue
            </Badge>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
              Draft validation
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-foreground">
            Do these components and typography patterns actually match the source?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This draft was scaffolded automatically. The main review question is
            whether the extracted component patterns, typography samples, and
            preview sections are actually faithful to the source material for{" "}
            {system.name}. If not, the next step should be to dig through the
            source CSS and HTML again and rebuild the draft with better matches.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <IssueBox
              label="Check components"
              body="Are the buttons, cards, forms, badges, tables, and other previewed components actually representative of the source design system?"
            />
            <IssueBox
              label="Check typography"
              body="Do the display, heading, and body samples reflect the real source type choices, scale, weight, and tone rather than guessed defaults?"
            />
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
              If the answer is no
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">
              Re-run extraction with a stronger pass over the source CSS, HTML,
              and captured UI files so the draft reflects the real system more
              accurately before review or publish.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function IssueBox({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{body}</p>
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
