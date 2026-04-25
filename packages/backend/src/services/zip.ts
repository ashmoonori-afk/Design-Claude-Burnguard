/**
 * Cross-platform zip creator used by the html_zip and handoff exports.
 *
 * The original implementation shelled out to PowerShell `Compress-Archive`,
 * which only worked on Windows and silently broke macOS / Linux builds
 * (P4 export audit). JSZip is pure JS and produces deterministic .zip
 * files on every platform Bun runs on.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const DEFAULT_COMPRESSION_LEVEL = 6;

/**
 * Recursively walks `srcDir` and writes every file inside it (relative
 * to `srcDir`) into `outPath` as a DEFLATE-compressed zip.
 *
 * Empty directories are not preserved. The contents of `srcDir` end up
 * at the zip root — `srcDir` itself is not part of the archive paths.
 */
export async function zipDirectory(
  srcDir: string,
  outPath: string,
): Promise<void> {
  const zip = new JSZip();
  await addDirectory(zip, srcDir, "");
  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: DEFAULT_COMPRESSION_LEVEL },
  });
  await writeFile(outPath, buffer);
}

async function addDirectory(
  zip: JSZip,
  absDir: string,
  relPrefix: string,
): Promise<void> {
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    // Forward-slash separators in zip entry names — that's the spec, and
    // matters for cross-platform unzip behaviour (PowerShell's Expand-
    // Archive on Windows handles backslashes oddly, others reject them).
    const childRel = relPrefix
      ? `${relPrefix}/${entry.name}`
      : entry.name;
    const childAbs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(zip, childAbs, childRel);
    } else if (entry.isFile()) {
      const data = await readFile(childAbs);
      zip.file(childRel, data);
    }
    // Symlinks and other entry types are skipped — exports never need
    // them and they would just trip up consumers.
  }
}
