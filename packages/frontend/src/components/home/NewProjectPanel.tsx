import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

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

// Placeholder content for FE-S1-03 static layout.
// Switches to DesignSystemSummary[] from backend fixtures the moment Gate A lands.
const DS_PLACEHOLDERS = [
  { id: "goldman-sachs", label: "Goldman Sachs Design System" },
];

export default function NewProjectPanel({ type }: { type: ProjectType }) {
  const [name, setName] = useState("");
  const [ds, setDs] = useState(DS_PLACEHOLDERS[0].id);
  const [useSpeakerNotes, setUseSpeakerNotes] = useState(false);

  const canCreate = name.trim().length > 0;

  return (
    <div className="p-6">
      <h2 className="text-base font-semibold mb-4">{TYPE_LABEL[type]}</h2>

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
            value={ds}
            onChange={(e) => setDs(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {DS_PLACEHOLDERS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
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
        className="w-full mt-6"
        variant="cta"
        disabled={!canCreate}
        onClick={() =>
          alert(
            `[static stub] would create ${type} "${name}" with ${ds}${
              type === "slide_deck"
                ? `, speaker_notes=${useSpeakerNotes}`
                : ""
            }`,
          )
        }
      >
        <Plus className="h-4 w-4" /> Create
      </Button>

      <p className="mt-3 text-[11px] text-muted-foreground text-center">
        Only you can see your project by default.
      </p>
    </div>
  );
}
