export default function UserMessage({
  text,
  attachmentCount,
}: {
  text: string;
  attachmentCount?: number;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
        {text}
        {attachmentCount && attachmentCount > 0 ? (
          <div className="mt-1 text-[10px] text-muted-foreground">
            📎 {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
