import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ProjectCardPlaceholder {
  id: string;
  name: string;
  subtitle: string;
  tintClass: string;
  emoji?: string;
  isTemplate?: boolean;
  href: string;
}

export default function ProjectCard(props: ProjectCardPlaceholder) {
  return (
    <Link
      to={props.href}
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-app-3 transition-shadow"
    >
      <div
        className={cn(
          "h-[120px] grid place-items-center text-2xl",
          props.tintClass,
        )}
      >
        {props.emoji ? (
          <span className="text-3xl">{props.emoji}</span>
        ) : (
          <div className="h-10 w-10 rounded bg-white/50 border border-border" />
        )}
      </div>
      {props.isTemplate && (
        <Badge
          variant="outline"
          className="absolute top-2 left-2 bg-background/95 text-[10px] uppercase tracking-wider"
        >
          Template
        </Badge>
      )}
      <div className="p-3">
        <div className="text-sm font-medium text-foreground line-clamp-1">
          {props.name}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {props.subtitle}
        </div>
      </div>
    </Link>
  );
}
