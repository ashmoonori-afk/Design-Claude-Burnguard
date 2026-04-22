import { useParams } from "react-router-dom";

export default function ProjectView() {
  const { id } = useParams();
  return (
    <div className="flex-1 grid place-items-center">
      <div className="max-w-md text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Project shell
        </div>
        <div className="mt-2 text-lg font-medium font-mono">{id}</div>
        <p className="mt-4 text-sm text-muted-foreground">
          ProjectView lands in FE-S1-04 (shell) and FE-S2-04 (real data). This is
          a routing stub.
        </p>
      </div>
    </div>
  );
}
