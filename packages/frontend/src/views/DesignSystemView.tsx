import { useParams } from "react-router-dom";

export default function DesignSystemView() {
  const { id } = useParams();
  return (
    <div className="flex-1 grid place-items-center">
      <div className="max-w-md text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Design system shell
        </div>
        <div className="mt-2 text-lg font-medium font-mono">{id}</div>
        <p className="mt-4 text-sm text-muted-foreground">
          Wired in Sprint 2 (FE-S2-02).
        </p>
      </div>
    </div>
  );
}
