export default function AgentMessage({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
      {text}
    </div>
  );
}
