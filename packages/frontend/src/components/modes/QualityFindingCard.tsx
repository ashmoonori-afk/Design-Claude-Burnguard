import type { DesignAuditFinding } from "@bg/shared";
import { AlertTriangle, Eye, FileCode2, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { designAuditActionAvailability, type DesignAuditActionContext } from "@/lib/design-audit-state";
import { DESIGN_AUDIT_ACTION_COPY, DESIGN_AUDIT_CHECK_COPY } from "./design-audit-copy";

export type RevealResult = "found" | "not_found" | null;

export default function QualityFindingCard({ finding, actionContext, revealResult, onOpenFile, onReveal, onApplySafeFix }: {
  readonly finding: DesignAuditFinding;
  readonly actionContext: DesignAuditActionContext;
  readonly revealResult: RevealResult;
  readonly onOpenFile: (finding: DesignAuditFinding) => void;
  readonly onReveal: (finding: DesignAuditFinding) => void;
  readonly onApplySafeFix: (finding: DesignAuditFinding) => void;
}) {
  const actions = designAuditActionAvailability(finding, actionContext);
  const mustFix = finding.severity === "must_fix";
  return (
    <article className="min-w-0 rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <span className={mustFix ? "mt-0.5 text-destructive" : "mt-0.5 text-warning"} aria-hidden="true">
          {mustFix ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{DESIGN_AUDIT_CHECK_COPY[finding.check_code]}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{mustFix ? "고쳐야 할 문제" : "권장 개선"}</div>
        </div>
      </div>
      <p className="mt-2 break-keep text-xs leading-relaxed">{DESIGN_AUDIT_ACTION_COPY[finding.targeted_action]}</p>
      <div className="mt-2 min-w-0 rounded bg-muted px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground" title={finding.evidence}>
        <span className="block font-sans font-medium text-foreground">검사 근거</span>
        <span className="block max-h-12 overflow-hidden break-words">{finding.evidence}</span>
        {(finding.measured !== undefined || finding.threshold !== undefined) && <span className="mt-1 block">측정 {finding.measured ?? "-"} / 기준 {finding.threshold ?? "-"}</span>}
      </div>
      <div className="mt-2 min-w-0 truncate font-mono text-[10px] text-muted-foreground" title={`${finding.source.rel_path}${finding.source.node_bg_id ? ` · ${finding.source.node_bg_id}` : ""}`}>
        {finding.source.rel_path}{finding.source.node_bg_id ? ` · ${finding.source.node_bg_id}` : " · 강조할 위치 정보 없음"}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {actions.canOpenFile && <Button type="button" variant="outline" size="sm" className="h-8 px-2 max-[900px]:min-h-11" onClick={() => onOpenFile(finding)}><FileCode2 />파일 열기</Button>}
        {actions.canReveal && <Button type="button" variant="outline" size="sm" className="h-8 px-2 max-[900px]:min-h-11" onClick={() => onReveal(finding)}><Eye />위치 보기</Button>}
        {finding.safe_fix && <Button type="button" variant="outline" size="sm" className="h-8 px-2 max-[900px]:min-h-11" disabled={!actions.canApplySafeFix} title={!actionContext.current ? "현재 결과가 아니어서 안전 수정을 적용할 수 없어요" : actionContext.running ? "검사가 끝난 뒤 안전 수정을 적용할 수 있어요" : actions.applying ? "안전 수정을 적용하고 있어요" : actionContext.pendingFindingId !== null ? "다른 안전 수정을 적용하고 있어요" : undefined} onClick={() => onApplySafeFix(finding)}><ShieldCheck />{actions.applying ? "적용 중" : "안전 수정 적용"}</Button>}
      </div>
      {revealResult !== null && <p className="mt-2 break-keep text-[11px] text-muted-foreground">{revealResult === "found" ? "캔버스에서 위치를 강조했어요." : "현재 렌더링에서 위치를 찾지 못했어요."}</p>}
    </article>
  );
}
