import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DECK_STAGE_JS } from "../runtime/deck-stage";
import { resolveWithin } from "../security/path-boundary";

export async function prepareSlideDeckExport(projectDir: string, entrypoint: string): Promise<void> {
  const entrypointPath = resolveWithin(projectDir, entrypoint);
  const runtimeDir = path.join(projectDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(path.join(runtimeDir, "deck-stage.js"), DECK_STAGE_JS, "utf8");
  const relative = path.relative(path.dirname(entrypointPath), path.join(runtimeDir, "deck-stage.js")).replaceAll("\\", "/");
  await writeFile(entrypointPath, (await readFile(entrypointPath, "utf8")).replaceAll("/runtime/deck-stage.js", relative), "utf8");
}
