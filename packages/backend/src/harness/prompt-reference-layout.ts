import type { UploadedVisualSourceSelection } from "@bg/shared";
import type { buildSessionContext } from "../services/context";
import type { StageAttachmentInput } from "../services/stage-attachment-inputs";
import { buildReferenceLayoutContext } from "../services/reference-layout";
import { REFERENCE_LAYOUT_SKILL_MD } from "./skills/reference-layout-skill";

type SessionContext = NonNullable<
  Awaited<ReturnType<typeof buildSessionContext>>
>;

export function appendReferenceLayoutContext(
  lines: string[],
  input: {
    readonly request: string;
    readonly attachments: SessionContext["attachments"];
    readonly requestedPaths: readonly string[];
    readonly selections?: readonly UploadedVisualSourceSelection[];
    readonly projectDir?: string;
    readonly stageInputs?: readonly StageAttachmentInput[];
  },
): boolean {
  const context = buildReferenceLayoutContext(input);
  if (context === null) return false;
  lines.push("<burnguard-reference-layout-v1>");
  lines.push(JSON.stringify(context));
  lines.push("</burnguard-reference-layout-v1>");
  lines.push("");
  lines.push("## Reference layout skill");
  lines.push(REFERENCE_LAYOUT_SKILL_MD);
  lines.push("");
  return true;
}
