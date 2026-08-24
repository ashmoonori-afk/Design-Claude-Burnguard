import JSZip from "jszip";

export class ExportPackageError extends Error {
  readonly name = "ExportPackageError";
  constructor(readonly code: "invalid_package" | "missing_part" | "slide_mismatch" | "missing_editable_text") { super(code); }
}

export async function validatePptxPackage(bytes: Uint8Array, expectedSlides: number): Promise<{ readonly slides: number; readonly editable_text_nodes: number }> {
  const zip = await load(bytes); const names = safeNames(zip);
  for (const required of ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"]) if (!names.has(required)) fail("missing_part");
  const slides = [...names].filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort();
  if (slides.length !== expectedSlides) fail("slide_mismatch");
  let editable = 0;
  for (const name of slides) {
    const source = await zip.file(name)?.async("string");
    if (source === undefined) fail("missing_part");
    editable += [...source.matchAll(/<a:t(?:\s[^>]*)?>[^<]+<\/a:t>/gu)].length;
  }
  if (editable === 0) fail("missing_editable_text");
  return { slides: slides.length, editable_text_nodes: editable };
}

export async function validateHandoffPackage(bytes: Uint8Array, entrypoint: string): Promise<{ readonly source_files: number; readonly nodes: number }> {
  const zip = await load(bytes); const names = safeNames(zip);
  for (const required of ["README.txt", "spec.json", `source/${entrypoint}`]) if (!names.has(required)) fail("missing_part");
  const source = await zip.file("spec.json")?.async("string"); if (source === undefined) fail("missing_part");
  let value: unknown; try { value = JSON.parse(source); } catch { fail("invalid_package"); }
  if (!isRecord(value) || value["spec_version"] !== 1 || !Array.isArray(value["pages"])) fail("invalid_package");
  let nodes = 0;
  for (const page of value["pages"]) { if (!isRecord(page) || !Array.isArray(page["nodes"])) fail("invalid_package"); nodes += page["nodes"].length; }
  return { source_files: [...names].filter((name) => name.startsWith("source/")).length, nodes };
}
async function load(bytes: Uint8Array): Promise<JSZip> { try { return await JSZip.loadAsync(bytes, { checkCRC32: true }); } catch { return fail("invalid_package"); } }
function safeNames(zip: JSZip): ReadonlySet<string> {
  const names = new Set<string>(); const canonical = new Set<string>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue; const name = entry.name;
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || name.normalize("NFC") !== name) fail("invalid_package");
    const key = name.toLocaleLowerCase("en-US"); if (canonical.has(key)) fail("invalid_package"); canonical.add(key); names.add(name);
  }
  return names;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function fail(code: ExportPackageError["code"]): never { throw new ExportPackageError(code); }
