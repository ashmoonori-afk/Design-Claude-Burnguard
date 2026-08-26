import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { resolveWithin } from "../security/path-boundary";

export type MaterializationHooks = {
  readonly afterOpen?: (kind: "source" | "extracted") => Promise<void>;
};

export class StageAttachmentInputError extends Error {
  readonly name = "StageAttachmentInputError";
  readonly code = "stage_attachment_input_invalid";
  constructor() { super("stage_attachment_input_invalid"); }
}

type ManagedReadInput = {
  readonly projectDir: string;
  readonly filePath: string;
  readonly maximumBytes: number;
  readonly expectedSize?: number;
  readonly expectedSha256?: string;
  readonly kind: "source" | "extracted";
  readonly hooks?: MaterializationHooks;
};

export async function readManagedFile(input: ManagedReadInput): Promise<Uint8Array> {
  const bytes = await readManagedFileOrNull(input, false);
  if (bytes === null) throw new StageAttachmentInputError();
  return bytes;
}

export async function readOptionalManagedFile(input: ManagedReadInput): Promise<Uint8Array | null> {
  return await readManagedFileOrNull(input, true);
}

async function readManagedFileOrNull(input: ManagedReadInput, optional: boolean): Promise<Uint8Array | null> {
  const canonical = resolveManagedPath(input.projectDir, input.filePath);
  if (canonical !== input.filePath) throw new StageAttachmentInputError();
  let handle: FileHandle | null = null;
  try {
    try {
      handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (optional && error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const before = await handle.stat();
    if (!before.isFile() || before.size > input.maximumBytes || (input.expectedSize !== undefined && before.size !== input.expectedSize)) throw new StageAttachmentInputError();
    await input.hooks?.afterOpen?.(input.kind);
    const bytes = await readHandleBytes(handle, before.size);
    const after = await handle.stat();
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || bytes.byteLength !== before.size || (input.expectedSha256 !== undefined && createHash("sha256").update(bytes).digest("hex") !== input.expectedSha256)) throw new StageAttachmentInputError();
    return bytes;
  } finally {
    await handle?.close();
  }
}

function resolveManagedPath(projectDir: string, filePath: string): string {
  return resolveWithin(projectDir, ".attachments", path.basename(filePath));
}

export async function writePrivateFile(filePath: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
      offset += bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readHandleBytes(handle: FileHandle, size: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return offset === size ? bytes : bytes.subarray(0, offset);
}
