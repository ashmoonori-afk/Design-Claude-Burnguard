import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalTreeEntry, CanonicalTreeManifest } from "./canonical-tree-manifest";
import { inspectCanonicalTree, validateCanonicalTree } from "./canonical-tree-manifest";

export type ArtifactFileDiff = {
  readonly path: string;
  readonly action: "created" | "edited" | "deleted";
  readonly before_hash: string | null;
  readonly after_hash: string | null;
  readonly before_bytes: number;
  readonly after_bytes: number;
};

export async function materializeManagedTree(source: string, destination: string): Promise<CanonicalTreeManifest> {
  const manifest = await inspectCanonicalTree(source);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of manifest.files) {
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(source, file.path)));
  }
  return validateCanonicalTree(destination, manifest);
}

export function diffManagedTrees(before: CanonicalTreeManifest, after: CanonicalTreeManifest): readonly ArtifactFileDiff[] {
  const beforeByPath = new Map(before.files.map((file) => [file.path, file]));
  const afterByPath = new Map(after.files.map((file) => [file.path, file]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort(compareText);
  const changes: ArtifactFileDiff[] = [];
  for (const filePath of paths) {
    const previous = beforeByPath.get(filePath);
    const next = afterByPath.get(filePath);
    if (previous?.sha256 === next?.sha256 && previous?.size === next?.size) continue;
    changes.push({
      path: filePath,
      action: previous === undefined ? "created" : next === undefined ? "deleted" : "edited",
      before_hash: previous?.sha256 ?? null,
      after_hash: next?.sha256 ?? null,
      before_bytes: previous?.size ?? 0,
      after_bytes: next?.size ?? 0,
    });
  }
  return changes;
}

export async function publishManagedTree(
  source: string,
  destination: string,
  afterWrite?: (relativePath: string) => void,
): Promise<CanonicalTreeManifest> {
  const sourceManifest = await inspectCanonicalTree(source);
  const destinationManifest = await inspectCanonicalTree(destination);
  const sourcePaths = new Set(sourceManifest.files.map((file) => file.path));
  for (const file of [...destinationManifest.files].reverse()) {
    if (!sourcePaths.has(file.path)) await unlink(path.join(destination, file.path));
  }
  for (const file of sourceManifest.files) {
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
    await writeFile(temporary, await readFile(path.join(source, file.path)));
    await rename(temporary, target);
    afterWrite?.(file.path);
  }
  await removeEmptyManagedDirectories(destination);
  return validateCanonicalTree(destination, sourceManifest);
}

export function manifestEntry(manifest: CanonicalTreeManifest, relativePath: string): CanonicalTreeEntry | null {
  return manifest.files.find((file) => file.path === relativePath) ?? null;
}

async function removeEmptyManagedDirectories(root: string, current = root): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (!entry.isDirectory() || (current === root && isExcluded(entry.name))) continue;
    const target = path.join(current, entry.name);
    await removeEmptyManagedDirectories(root, target);
    if ((await readdir(target)).length === 0) await rm(target, { recursive: true });
  }
}

function isExcluded(name: string): boolean {
  return name === ".meta" || name === ".attachments" || name === ".git" || name === ".omc" || name === ".claude";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
