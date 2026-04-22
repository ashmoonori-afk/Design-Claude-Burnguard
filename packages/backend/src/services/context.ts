import { listSessionAttachments } from "../db/attachments";
import { getSessionProject } from "../db/events";
import { getDesignSystemDetail } from "../db/seed";
import { indexProjectFiles, listIndexedProjectFiles } from "./files";

export async function buildSessionContext(sessionId: string) {
  const project = await getSessionProject(sessionId);
  if (!project) {
    return null;
  }

  await indexProjectFiles(project.project_id);

  const [designSystem, files, attachments] = await Promise.all([
    project.design_system_id
      ? getDesignSystemDetail(project.design_system_id)
      : Promise.resolve(null),
    listIndexedProjectFiles(project.project_id),
    listSessionAttachments(sessionId),
  ]);

  return {
    project,
    designSystem,
    files,
    attachments,
  };
}

