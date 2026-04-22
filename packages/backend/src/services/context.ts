import { listSessionAttachments } from "../db/attachments";
import { listProjectComments } from "../db/comments";
import { getSessionProject } from "../db/events";
import { getDesignSystemDetail } from "../db/seed";
import { indexProjectFiles, listIndexedProjectFiles } from "./files";

export async function buildSessionContext(sessionId: string) {
  const project = await getSessionProject(sessionId);
  if (!project) {
    return null;
  }

  await indexProjectFiles(project.project_id);

  const [designSystem, files, attachments, comments] = await Promise.all([
    project.design_system_id
      ? getDesignSystemDetail(project.design_system_id)
      : Promise.resolve(null),
    listIndexedProjectFiles(project.project_id),
    listSessionAttachments(sessionId),
    listProjectComments(project.project_id),
  ]);

  return {
    project,
    designSystem,
    files,
    attachments,
    openComments: comments.filter((c) => c.resolved_at === null),
  };
}

