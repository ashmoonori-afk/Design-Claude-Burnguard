import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  BackendId,
  CreateProjectResponse,
  DesignSystemSummary,
} from "@bg/shared";
import { createProject } from "@/api/home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/state/uiStore";

export type ProjectType =
  | "prototype"
  | "slide_deck"
  | "from_template"
  | "other";

const TYPE_LABEL: Record<ProjectType, string> = {
  prototype: "New prototype",
  slide_deck: "New slide deck",
  from_template: "New from template",
  other: "New project",
};

export default function NewProjectPanel({
  type,
  designSystems,
  defaultBackend,
  onCreated,
}: {
  type: ProjectType;
  designSystems: DesignSystemSummary[];
  defaultBackend: BackendId;
  onCreated: (project: CreateProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [name, setName] = useState("");
  const [dsId, setDsId] = useState<string>(designSystems[0]?.id ?? "");
  const [useSpeakerNotes, setUseSpeakerNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!designSystems.find((s) => s.id === dsId) && designSystems[0]) {
      setDsId(designSystems[0].id);
    }
  }, [designSystems, dsId]);

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        name: name.trim(),
        type,
        design_system_id: dsId || null,
        backend_id: defaultBackend,
        options:
          type === "slide_deck"
            ? { use_speaker_notes: useSpeakerNotes }
            : undefined,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated(created);
      navigate(`/projects/${created.id}`);
      setName("");
      setUseSpeakerNotes(false);
      setError(null);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Failed to create project";
      setError(message);
      pushToast({
        title: "Could not create project",
        body: message,
        tone: "error",
      });
    },
  });

  const canCreate = name.trim().length > 0 && !createMutation.isPending;
  const hasSystems = designSystems.length > 0;

  function handleCreate() {
    if (!canCreate || !hasSystems) {
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-base font-semibold">{TYPE_LABEL[type]}</h2>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="project-name"
            className="text-xs font-medium text-muted-foreground"
          >
            Project name
          </label>
          <Input
            id="project-name"
            placeholder="Untitled"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="design-system"
            className="text-xs font-medium text-muted-foreground"
          >
            Design system
          </label>
          <select
            id="design-system"
            value={dsId}
            onChange={(e) => setDsId(e.target.value)}
            disabled={!hasSystems || createMutation.isPending}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {hasSystems ? (
              designSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_template ? " (Template)" : ""}
                  {s.status === "draft"
                    ? " (Draft)"
                    : s.status === "review"
                      ? " (Review)"
                      : ""}
                </option>
              ))
            ) : (
              <option value="">No design systems available</option>
            )}
          </select>
        </div>

        {type === "slide_deck" && (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <div className="text-sm">Use speaker notes</div>
              <div className="text-xs text-muted-foreground">
                Less text on slides
              </div>
            </div>
            <Switch
              checked={useSpeakerNotes}
              onCheckedChange={setUseSpeakerNotes}
            />
          </div>
        )}
      </div>

      <Button
        className="mt-6 w-full"
        variant="cta"
        disabled={!canCreate || !hasSystems}
        onClick={handleCreate}
      >
        <Plus className="h-4 w-4" />{" "}
        {createMutation.isPending ? "Creating..." : "Create"}
      </Button>

      {error ? (
        <p className="mt-3 text-center text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Only you can see your project by default.
        </p>
      )}
    </div>
  );
}
