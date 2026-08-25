const publishingProjects = new Set<string>();

export function beginArtifactPublication(projectId: string): void {
  publishingProjects.add(projectId);
}

export function endArtifactPublication(projectId: string): void {
  publishingProjects.delete(projectId);
}

export function isArtifactPublicationActive(projectId: string): boolean {
  return publishingProjects.has(projectId);
}
