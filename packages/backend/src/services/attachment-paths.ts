export function attachmentSummaryPath(filePath: string): string {
  return `${filePath}.summary.json`;
}

export function attachmentExtractedTextPath(filePath: string): string {
  return `${filePath}.extracted.md`;
}
