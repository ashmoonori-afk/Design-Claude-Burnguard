import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import CardGrid from "@/components/home/CardGrid";
import ProjectCard, {
  type ProjectCardPlaceholder,
} from "@/components/home/ProjectCard";

/**
 * FE-S1-03 static layout — placeholder card content.
 * Replaces with ProjectSummary[] + DesignSystemSummary[] fixtures once Gate A lands.
 */
const PLACEHOLDERS: Record<string, ProjectCardPlaceholder[]> = {
  recent: [
    {
      id: "tutorial",
      name: "Learn about Claude Design",
      subtitle: "Quick tutorial",
      tintClass: "bg-accent/10 text-accent",
      emoji: "📖",
      href: "/projects/tutorial",
    },
    {
      id: "gs",
      name: "Goldman Sachs Design System",
      subtitle: "Design system · Today",
      tintClass: "bg-rose-100",
      href: "/systems/goldman-sachs",
    },
    {
      id: "investor-landing",
      name: "Investor Landing",
      subtitle: "Your design · Today",
      tintClass: "bg-slate-100",
      href: "/projects/investor-landing",
    },
    {
      id: "salt",
      name: "Salt (JPMorgan) Design System",
      subtitle: "Design system · Today",
      tintClass: "bg-sky-100",
      href: "/systems/salt",
    },
    {
      id: "toss",
      name: "Toss Design System",
      subtitle: "Design system · Yesterday",
      tintClass: "bg-blue-100",
      href: "/systems/toss",
    },
    {
      id: "toss-tpl",
      name: "Toss Design System (Template)",
      subtitle: "Your design · Yesterday",
      tintClass: "bg-blue-50",
      isTemplate: true,
      href: "/systems/toss-tpl",
    },
  ],
  mine: [],
  examples: [],
  systems: [],
};

export default function HomeView() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <Tabs defaultValue="recent" className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 gap-4">
          <TabsList>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="mine">Your designs</TabsTrigger>
            <TabsTrigger value="examples">Examples</TabsTrigger>
            <TabsTrigger value="systems">Design systems</TabsTrigger>
          </TabsList>

          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-8" />
          </div>
        </div>

        <div className="px-8 pb-8">
          <TabsContent value="recent">
            <CardGrid>
              {PLACEHOLDERS.recent.map((c) => (
                <ProjectCard key={c.id} {...c} />
              ))}
            </CardGrid>
          </TabsContent>
          <TabsContent value="mine">
            <EmptyState text="Your designs will appear here." />
          </TabsContent>
          <TabsContent value="examples">
            <EmptyState text="Examples bundled with the app will appear here." />
          </TabsContent>
          <TabsContent value="systems">
            <EmptyState text="Design systems you publish will appear here." />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
