import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { detectBackends, listDesignSystems, listProjects } from "@/api/home";
import CardGrid from "@/components/home/CardGrid";
import {
  projectToCard,
  systemToCard,
  type CardViewModel,
} from "@/components/home/mappers";
import ProjectCard from "@/components/home/ProjectCard";
import CliMissingModal from "@/components/errors/CliMissingModal";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useUIStore } from "@/state/uiStore";

type HomeTab = "recent" | "mine" | "examples" | "systems";

export default function HomeView() {
  const [activeTab, setActiveTab] = useState<HomeTab>("recent");
  const cliMissingShown = useUIStore((s) => s.cliMissingShown);
  const setCliMissingShown = useUIStore((s) => s.setCliMissingShown);
  const [cliMissingOpen, setCliMissingOpen] = useState(false);

  const recentQuery = useQuery({
    queryKey: ["projects", "recent"],
    queryFn: () => listProjects("recent"),
    enabled: activeTab === "recent",
  });
  const mineQuery = useQuery({
    queryKey: ["projects", "mine"],
    queryFn: () => listProjects("mine"),
    enabled: activeTab === "mine",
  });
  const examplesQuery = useQuery({
    queryKey: ["projects", "examples"],
    queryFn: () => listProjects("examples"),
    enabled: activeTab === "examples",
  });
  const systemsQuery = useQuery({
    queryKey: ["design-systems", "published"],
    queryFn: () => listDesignSystems("published"),
    enabled: activeTab === "systems",
  });
  const detectionQuery = useQuery({
    queryKey: ["backends", "detect"],
    queryFn: detectBackends,
  });

  useEffect(() => {
    const detection = detectionQuery.data;
    if (!detection || cliMissingShown) {
      return;
    }

    if (detection.backends.every((backend) => !backend.found)) {
      setCliMissingOpen(true);
      setCliMissingShown(true);
    }
  }, [cliMissingShown, detectionQuery.data, setCliMissingShown]);

  const recentCards = (recentQuery.data ?? []).map(projectToCard);
  const mineCards = (mineQuery.data ?? []).map(projectToCard);
  const exampleCards = (examplesQuery.data ?? []).map(projectToCard);
  const systemCards = (systemsQuery.data ?? []).map((system, index) =>
    systemToCard(system, index),
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as HomeTab)}
          className="flex flex-1 flex-col"
        >
          <div className="flex items-center justify-between gap-4 px-8 pb-4 pt-8">
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="mine">Your designs</TabsTrigger>
              <TabsTrigger value="examples">Examples</TabsTrigger>
              <TabsTrigger value="systems">Design systems</TabsTrigger>
            </TabsList>

            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search" className="pl-8" />
            </div>
          </div>

          <div className="px-8 pb-8">
            <TabsContent value="recent">
              <CardSection
                cards={recentCards}
                emptyText="No recent projects yet."
              />
            </TabsContent>

            <TabsContent value="mine">
              <CardSection
                cards={mineCards}
                emptyText="No personal projects yet."
              />
            </TabsContent>

            <TabsContent value="examples">
              <CardSection
                cards={exampleCards}
                emptyText="No template-based examples yet."
              />
            </TabsContent>

            <TabsContent value="systems">
              <CardSection
                cards={systemCards}
                emptyText="No published design systems yet."
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {detectionQuery.data ? (
        <CliMissingModal
          open={cliMissingOpen}
          onOpenChange={setCliMissingOpen}
          detection={detectionQuery.data}
        />
      ) : null}
    </>
  );
}

function CardSection({
  cards,
  emptyText,
}: {
  cards: CardViewModel[];
  emptyText: string;
}) {
  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <CardGrid>
      {cards.map((card) => (
        <ProjectCard key={card.id} {...card} />
      ))}
    </CardGrid>
  );
}
