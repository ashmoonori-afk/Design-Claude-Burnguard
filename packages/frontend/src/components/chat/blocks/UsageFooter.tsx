import type { SessionInfo } from "@bg/shared";

export default function UsageFooter({
  usage,
}: {
  usage: SessionInfo["usage"];
}) {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="sticky bottom-0 -mx-3 -mb-4 border-t border-border bg-background/95 backdrop-blur px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
      <span>in {fmt(usage.input)}</span>
      <span>out {fmt(usage.output)}</span>
      <span>cached {fmt(usage.cached)}</span>
    </div>
  );
}
