import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  deleteProject,
  detectBackends,
  listDesignSystems,
  listProjects,
} from "@/api/home";
import CardGrid from "@/components/home/CardGrid";
import {
  projectToCard,
  systemToCard,
  type CardViewModel,
} from "@/components/home/mappers";
import ProjectCard from "@/components/home/ProjectCard";
import DeleteProjectDialog from "@/components/home/DeleteProjectDialog";
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
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [activeTab, setActiveTab] = useState<HomeTab>("recent");
  const cliMissingShown = useUIStore((s) => s.cliMissingShown);
  const setCliMissingShown = useUIStore((s) => s.setCliMissingShown);
  const [cliMissingOpen, setCliMissingOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      pushToast({ title: "Project deleted", tone: "success" });
      setDeleteTarget(null);
    },
    onError: (err) => {
      pushToast({
        title: "Delete failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
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

  const onProjectDelete = (card: CardViewModel) =>
    setDeleteTarget({ id: card.id, name: card.name });

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
                onDelete={onProjectDelete}
              />
            </TabsContent>

            <TabsContent value="mine">
              <CardSection
                cards={mineCards}
                emptyText="No personal projects yet."
                onDelete={onProjectDelete}
              />
            </TabsContent>

            <TabsContent value="examples">
              <CardSection
                cards={exampleCards}
                emptyText="No template-based examples yet."
                onDelete={onProjectDelete}
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

      <DeleteProjectDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        projectName={deleteTarget?.name ?? ""}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

function CardSection({
  cards,
  emptyText,
  onDelete,
}: {
  cards: CardViewModel[];
  emptyText: string;
  onDelete?: (card: CardViewModel) => void;
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
        <ProjectCard
          key={card.id}
          {...card}
          onDelete={onDelete ? () => onDelete(card) : undefined}
        />
      ))}
    </CardGrid>
  );
}
