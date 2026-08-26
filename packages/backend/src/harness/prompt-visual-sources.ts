import type { buildSessionContext } from "../services/context";
import type { UploadedVisualSourceSelection, VisualSourceManifestV1 } from "@bg/shared";
import { buildVisualSourceManifest } from "../services/visual-source-manifest";
import { StageAttachmentInputError, type StageAttachmentInput } from "../services/stage-attachment-inputs";

type SessionContext = NonNullable<Awaited<ReturnType<typeof buildSessionContext>>>;

export async function appendVisualSourceContext(
  lines: string[],
  input: {
    readonly projectDir: string;
    readonly attachments: SessionContext["attachments"];
    readonly requestedPaths: readonly string[];
    readonly selections: readonly UploadedVisualSourceSelection[] | undefined;
    readonly prebuiltManifest?: VisualSourceManifestV1 | null;
    readonly stageInputs?: readonly StageAttachmentInput[];
  },
): Promise<void> {
  const hasAssignedSource = input.attachments.some((attachment) => input.requestedPaths.includes(attachment.file_path) && attachment.turn_id !== null);
  const manifest = input.prebuiltManifest === undefined
    ? hasAssignedSource ? await buildVisualSourceManifest(input) : null
    : input.prebuiltManifest;
  if (manifest === null) return;
  const promptManifest = input.stageInputs === undefined ? manifest : {
    ...manifest,
    sources: manifest.sources.map((source) => {
      const stageInput = input.stageInputs?.find((candidate) => candidate.attachmentId === source.attachment_id);
      if (stageInput === undefined) throw new StageAttachmentInputError();
      return { ...source, managed_path: stageInput.sourcePath };
    }),
  };
  lines.push("<burnguard-visual-sources-v1>");
  lines.push(JSON.stringify(promptManifest));
  lines.push("</burnguard-visual-sources-v1>");
  if (manifest.sources.some((source) => source.role === "immutable_reference")) {
    lines.push("Immutable visual references are read-only underlays: preserve each original file, hash, and provenance; never overwrite or copy it into authored output; keep every derived artifact separate.");
  }
  lines.push("");
}
