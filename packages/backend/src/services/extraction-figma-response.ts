import {
  AcquisitionLimitError,
  DEFAULT_ACQUISITION_LIMITS,
  throwIfAcquisitionAborted,
  type AcquisitionLimits,
} from "./extraction-acquisition";
import { FigmaApiError } from "./figma-errors";

export function assertFigmaItemCount(
  count: number,
  limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS,
): void {
  if (count > limits.parsedItems) {
    throw new AcquisitionLimitError("parsed_items", limits.parsedItems, count);
  }
}

export async function readFigmaResponse(
  response: Response,
  signal?: AbortSignal,
  limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS,
): Promise<unknown> {
  if (response.body === null) throw new FigmaApiError("fetch_failed", "Figma API returned an empty body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      throwIfAcquisitionAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limits.figmaBodyBytes) {
        throw new AcquisitionLimitError("figma_body_bytes", limits.figmaBodyBytes, bytes);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  throwIfAcquisitionAborted(signal);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) throw new FigmaApiError("fetch_failed", "Figma API returned malformed JSON.");
    throw error;
  }
}
