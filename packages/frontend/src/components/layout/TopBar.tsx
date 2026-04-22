import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export default function TopBar() {
  const { pathname } = useLocation();
  return (
    <header className="h-12 border-b border-border bg-background flex items-center px-4 shrink-0">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Home
      </Link>
      <div className="mx-3 text-muted-foreground text-sm">·</div>
      <div className="text-sm text-foreground font-mono">{pathname}</div>
    </header>
  );
}
