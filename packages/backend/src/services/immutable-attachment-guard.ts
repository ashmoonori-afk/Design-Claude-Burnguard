import { createHash } from "node:crypto";
import { lstat, open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { VisualSourceRole } from "@bg/shared";
import { resolveWithin } from "../security/path-boundary";

const MAX_CAPTURE_BYTES = 25 * 1024 * 1024;

type AttachmentIdentity = {
  readonly file_path: string;
  readonly source_role: VisualSourceRole;
  readonly size_bytes: number;
  readonly sha256: string | null;
};

export type ImmutableSnapshot = {
  readonly filePath: string;
  readonly handle: FileHandle;
  readonly device: number;
  readonly inode: number;
  readonly bytes: Uint8Array;
  readonly sha256: string;
};

type ImmutableGuardErrorCode =
  | "immutable_reference_mutated"
  | "immutable_reference_path_unavailable";

export class ImmutableReferenceMutationError extends Error {
  readonly name = "ImmutableReferenceMutationError";
  constructor(readonly code: ImmutableGuardErrorCode) { super(code); }
}

export async function captureImmutableAttachments(
  attachments: readonly AttachmentIdentity[],
): Promise<readonly ImmutableSnapshot[]> {
  const immutable = attachments.filter(
    (attachment) => attachment.source_role === "immutable_reference",
  );
  if (
    immutable.reduce((total, attachment) => total + attachment.size_bytes, 0) >
    MAX_CAPTURE_BYTES
  ) throw new ImmutableReferenceMutationError("immutable_reference_mutated");

  const snapshots: ImmutableSnapshot[] = [];
  const opened: FileHandle[] = [];
  try {
    for (const attachment of immutable) {
      let canonical: string;
      try {
        canonical = resolveManagedAttachment(attachment.file_path);
      } catch {
        throw new ImmutableReferenceMutationError(
          "immutable_reference_path_unavailable",
        );
      }
      const handle = await open(canonical, "r+");
      opened.push(handle);
      const identity = await handle.stat();
      const currentPath = await lstat(resolveManagedAttachment(attachment.file_path));
      const bytes = await readHandleBytes(handle, identity.size);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (
        canonical !== attachment.file_path ||
        !identity.isFile() ||
        currentPath.isSymbolicLink() ||
        currentPath.dev !== identity.dev ||
        currentPath.ino !== identity.ino ||
        attachment.sha256 === null ||
        identity.size !== attachment.size_bytes ||
        digest !== attachment.sha256
      ) {
        throw new ImmutableReferenceMutationError("immutable_reference_mutated");
      }
      snapshots.push({
        filePath: attachment.file_path,
        handle,
        device: identity.dev,
        inode: identity.ino,
        bytes,
        sha256: digest,
      });
    }
    return snapshots;
  } catch (error) {
    await Promise.all(opened.map((handle) => handle.close()));
    if (error instanceof ImmutableReferenceMutationError) throw error;
    throw new ImmutableReferenceMutationError(
      "immutable_reference_path_unavailable",
    );
  }
}

export async function verifyImmutableAttachments(
  snapshots: readonly ImmutableSnapshot[],
): Promise<void> {
  let failure: ImmutableReferenceMutationError | null = null;
  try {
    for (const snapshot of snapshots) {
      const identity = await snapshot.handle.stat();
      const current = await readHandleBytes(snapshot.handle, identity.size);
      const mutated =
        identity.dev !== snapshot.device ||
        identity.ino !== snapshot.inode ||
        createHash("sha256").update(current).digest("hex") !== snapshot.sha256;
      if (mutated) await restoreHandle(snapshot);

      let pathAvailable = false;
      try {
        const canonical = resolveManagedAttachment(snapshot.filePath);
        const currentPath = await lstat(canonical);
        pathAvailable =
          canonical === snapshot.filePath &&
          !currentPath.isSymbolicLink() &&
          currentPath.dev === snapshot.device &&
          currentPath.ino === snapshot.inode;
      } catch {
        pathAvailable = false;
      }

      if (!pathAvailable) {
        failure ??= new ImmutableReferenceMutationError(
          "immutable_reference_path_unavailable",
        );
      } else if (mutated) {
        failure ??= new ImmutableReferenceMutationError(
          "immutable_reference_mutated",
        );
      }
    }
  } finally {
    await Promise.all(snapshots.map((snapshot) => snapshot.handle.close()));
  }
  if (failure !== null) throw failure;
}

function resolveManagedAttachment(filePath: string): string {
  const projectDir = path.dirname(path.dirname(filePath));
  return resolveWithin(
    projectDir,
    ".attachments",
    path.basename(filePath),
  );
}

async function readHandleBytes(
  handle: FileHandle,
  size: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(bytes, offset, size - offset, offset);
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  return offset === size ? bytes : bytes.subarray(0, offset);
}

async function restoreHandle(snapshot: ImmutableSnapshot): Promise<void> {
  await snapshot.handle.truncate(0);
  let offset = 0;
  while (offset < snapshot.bytes.byteLength) {
    const result = await snapshot.handle.write(
      snapshot.bytes,
      offset,
      snapshot.bytes.byteLength - offset,
      offset,
    );
    offset += result.bytesWritten;
  }
  await snapshot.handle.sync();
}
