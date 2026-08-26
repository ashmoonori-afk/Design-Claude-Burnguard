import { desc, eq, isNull } from "drizzle-orm";
import type { ProjectSummary } from "@bg/shared";
import { projectThumbnailUrl } from "../services/project-thumbnails";
import { getDb } from "./client";
import { designSystemsTable, projectsTable } from "./schema";
import { PROMPT_SAMPLE_TAG, TUTORIAL_TAG } from "./seed-tutorials";

export async function listHomeProjects(
  tab: string,
  limit: number,
  offset: number,
) {
  const rows = await getDb()
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      type: projectsTable.type,
      design_system_id: projectsTable.designSystemId,
      design_system_name: designSystemsTable.name,
      current_revision: projectsTable.currentRevision,
      current_digest: projectsTable.currentDigest,
      updated_at: projectsTable.updatedAt,
      archived_at: projectsTable.archivedAt,
    })
    .from(projectsTable)
    .leftJoin(
      designSystemsTable,
      eq(projectsTable.designSystemId, designSystemsTable.id),
    )
    .where(isNull(projectsTable.archivedAt))
    .orderBy(desc(projectsTable.updatedAt));

  const filtered =
    tab === "examples" ? rows.filter(isExampleProject) : rows;

  return {
    items: filtered.slice(offset, offset + limit).map(
      ({ current_revision, current_digest, ...summary }) => ({
        ...summary,
        thumbnail_path: projectThumbnailUrl({
          id: summary.id,
          current_revision,
          current_digest,
        }),
      }),
    ) satisfies ProjectSummary[],
    total: filtered.length,
  };
}

export function isExampleProject(row: {
  readonly type: string;
  readonly name: string;
}): boolean {
  if (row.type === "from_template") {
    return true;
  }
  return (
    row.name.startsWith(TUTORIAL_TAG) ||
    row.name.startsWith(PROMPT_SAMPLE_TAG)
  );
}
