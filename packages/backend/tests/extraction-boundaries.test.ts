import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ExtractionAcquisitionError,
  acquisitionLimits,
  createAcquisitionBudget,
} from "../src/services/extraction-acquisition";
import { parseCssSource } from "../src/services/extraction-css";
import { extractHtmlComponentSamples } from "../src/services/extraction-html";
import { analyzeLocalTree } from "../src/services/extraction-local-tree";
import { assertUploadSize, readBoundedUpload } from "../src/services/extraction-upload";
import { assertFigmaItemCount, readFigmaResponse } from "../src/services/extraction-figma-response";
import { FigmaApiError } from "../src/services/figma-errors";
import {
  reserveExtractionBundle,
  validateExtractionBundle,
  type ExtractionReservation,
} from "../src/services/extraction-publication";
import { buildExtractionProvenance } from "../src/services/extraction-provenance";

const roots: string[] = [];
const resistantWorkerUrl = new URL("./fixtures/css-parser-resistant-worker.ts", import.meta.url);
const oversizedWorkerUrl = new URL("./fixtures/css-parser-oversized-output-worker.ts", import.meta.url);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "bg-extraction-boundary-"));
  roots.push(root);
  return root;
}

async function awaitBounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("bounded worker termination deadline exceeded")), 5_000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function snapshot(root: string): Promise<readonly string[]> {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else entries.push(`${path.relative(root, absolute)}:${await readFile(absolute, "hex")}`);
    }
  };
  await visit(root);
  return entries.sort();
}

async function writeValidBundle(reservation: ExtractionReservation): Promise<void> {
  await mkdir(path.join(reservation.stagingDir, "fonts"), { recursive: true });
  await Promise.all([
    writeFile(path.join(reservation.stagingDir, "README.md"), "# Fixture\n"),
    writeFile(path.join(reservation.stagingDir, "SKILL.md"), "---\nname: fixture\n---\n"),
    writeFile(path.join(reservation.stagingDir, "colors_and_type.css"), ":root {}\n"),
    writeFile(path.join(reservation.stagingDir, "fonts", "fonts.css"), ":root {}\n"),
    writeFile(path.join(reservation.stagingDir, "extraction-provenance.json"), JSON.stringify(buildExtractionProvenance([], 1))),
  ]);
}

describe("production extraction boundaries", () => {
  test("Given a resistant real parser worker When its acquisition deadline expires Then the exact worker is terminated and reaped", async () => {
    // Given
    const budget = createAcquisitionBudget(undefined, 25);
    const sentinel = new Worker(new URL("data:text/javascript,self.onmessage=e=>postMessage(e.data)"));
    const sentinelReply = new Promise<MessageEvent>((resolve) => sentinel.addEventListener("message", resolve, { once: true }));
    const sentinelClosed = new Promise<void>((resolve) => sentinel.addEventListener("close", () => resolve(), { once: true }));
    sentinel.postMessage("alive");

    try {
      // When
      const failure = await awaitBounded(parseCssSource({
        content: ".card { border: 1px solid #123456; }",
        sourceId: "resistant.css",
        fileOrder: 0,
        signal: budget.signal,
        workerUrl: resistantWorkerUrl,
      }).catch((error: unknown) => error));

      // Then
      expect(failure).toBeInstanceOf(ExtractionAcquisitionError);
      if (!(failure instanceof ExtractionAcquisitionError)) throw failure;
      expect(failure.cleanupReceipt).toMatchObject({ kind: "worker", terminated: true, closed: true });
      expect((await awaitBounded(sentinelReply)).data).toBe("alive");
    } finally {
      sentinel.terminate();
      await awaitBounded(sentinelClosed);
      budget.dispose();
    }
  });

  test("Given Figma response and token counts beyond service limits When production boundaries consume them Then typed limits reject without mutation", async () => {
    // Given
    const managed = await fixtureRoot();
    await writeFile(path.join(managed, "sentinel"), "keep");
    const before = await snapshot(managed);
    const limits = acquisitionLimits({ figmaBodyBytes: 4, parsedItems: 1 });

    // When
    const bodyFailure = readFigmaResponse(new Response("12345"), undefined, limits);
    const itemFailure = () => assertFigmaItemCount(2, limits);

    // Then
    await expect(bodyFailure).rejects.toMatchObject({ limit: "figma_body_bytes", maximum: 4 });
    expect(itemFailure).toThrow(expect.objectContaining({ limit: "parsed_items", maximum: 1 }));
    expect(await snapshot(managed)).toEqual(before);
  });

  test("Given malformed Figma JSON When the production body boundary parses it Then the typed API error is stable", async () => {
    // Given / When
    const failure = readFigmaResponse(new Response("{"));

    // Then
    await expect(failure).rejects.toBeInstanceOf(FigmaApiError);
  });

  test("Given upload bytes beyond declared and streamed limits When production upload boundaries run Then both reject before publication", async () => {
    // Given
    const managed = await fixtureRoot();
    await writeFile(path.join(managed, "sentinel"), "keep");
    const before = await snapshot(managed);
    const limits = acquisitionLimits({ uploadBytes: 4 });
    const file = new File(["12345"], "fixture.pdf", { type: "application/pdf" });

    // When
    const declaredFailure = () => assertUploadSize(file, limits);
    const streamedFailure = readBoundedUpload(file, new AbortController().signal, limits);

    // Then
    expect(declaredFailure).toThrow(expect.objectContaining({ code: "invalid_upload" }));
    await expect(streamedFailure).rejects.toMatchObject({ limit: "upload_bytes", maximum: 4 });
    expect(await snapshot(managed)).toEqual(before);
  });

  test("Given HTML bytes and parsed items beyond service limits When the production parser runs Then typed limits reject without mutation", async () => {
    // Given
    const managed = await fixtureRoot();
    await writeFile(path.join(managed, "sentinel"), "keep");
    const before = await snapshot(managed);

    // When
    const bytesFailure = () => extractHtmlComponentSamples("<p>large</p>", undefined, acquisitionLimits({ htmlBytes: 4 }));
    const itemsFailure = () => extractHtmlComponentSamples("<i></i><i></i>", undefined, acquisitionLimits({ parsedItems: 1 }));

    // Then
    expect(bytesFailure).toThrow(expect.objectContaining({ limit: "html_bytes", maximum: 4 }));
    expect(itemsFailure).toThrow(expect.objectContaining({ limit: "parsed_items", maximum: 1 }));
    expect(await snapshot(managed)).toEqual(before);
  });

  test("Given CSS bytes, declarations, and worker output beyond limits When the owned parser runs Then each stable typed boundary rejects", async () => {
    // Given
    const managed = await fixtureRoot();
    await writeFile(path.join(managed, "sentinel"), "keep");
    const before = await snapshot(managed);

    // When
    const bytes = await parseCssSource({ content: "12345", limits: acquisitionLimits({ cssBytes: 4 }) });
    const declarations = await parseCssSource({ content: ".x{a:1;b:2}", limits: acquisitionLimits({ cssDeclarations: 1 }) });
    const issues = await parseCssSource({ content: ".x{a:url(a);b:url(b)}", limits: acquisitionLimits({ cssIssues: 1 }) });
    const inputFailure = parseCssSource({ content: ".x{a:1}", limits: acquisitionLimits({ cssWorkerInputBytes: 20 }) });
    const outputFailure = parseCssSource({ content: ".x{a:1}", limits: acquisitionLimits({ cssWorkerOutputBytes: 40 }), workerUrl: oversizedWorkerUrl });

    // Then
    expect(bytes.issues[0]?.reason).toBe("css_input_too_large");
    expect(declarations.issues.some((issue) => issue.reason === "css_declaration_limit")).toBe(true);
    expect(issues.issues.some((issue) => issue.reason === "css_issue_limit")).toBe(true);
    await expect(inputFailure).rejects.toMatchObject({ limit: "css_worker_input_bytes", maximum: 20 });
    await expect(outputFailure).rejects.toMatchObject({ limit: "css_worker_output_bytes", maximum: 40 });
    expect(await snapshot(managed)).toEqual(before);
  });

  test("Given local depth, file count, aggregate bytes, and per-file bytes beyond small limits When production traversal runs Then every boundary rejects", async () => {
    // Given
    const root = await fixtureRoot();
    await mkdir(path.join(root, "nested", "deep"), { recursive: true });
    await writeFile(path.join(root, "a.css"), "12345");
    await writeFile(path.join(root, "b.css"), "12345");
    const signal = new AbortController().signal;

    // When / Then
    await expect(analyzeLocalTree(root, "Fixture", signal, acquisitionLimits({ localDepth: 1 }))).rejects.toMatchObject({ limit: "local_depth" });
    await expect(analyzeLocalTree(root, "Fixture", signal, acquisitionLimits({ localFiles: 1 }))).rejects.toMatchObject({ limit: "local_files" });
    await expect(analyzeLocalTree(root, "Fixture", signal, acquisitionLimits({ sourceFileBytes: 4 }))).rejects.toMatchObject({ limit: "source_file_bytes" });
    await expect(analyzeLocalTree(root, "Fixture", signal, acquisitionLimits({ aggregateSourceBytes: 7 }))).rejects.toMatchObject({ limit: "aggregate_source_bytes" });
    expect(await readFile(path.join(root, "a.css"), "utf8")).toBe("12345");
  });

  test("Given publication unit and aggregate byte counts beyond limits When validation runs Then no staged or external bytes change", async () => {
    // Given
    const root = await fixtureRoot();
    const sentinel = path.join(root, "external-sentinel");
    await writeFile(sentinel, "keep");
    const unitsReservation = await reserveExtractionBundle(root, "units");
    await writeValidBundle(unitsReservation);
    const unitsBefore = await snapshot(root);

    // When / Then
    await expect(validateExtractionBundle(unitsReservation, undefined, acquisitionLimits({ publicationUnits: 5 }))).rejects.toMatchObject({ limit: "publication_units" });
    expect(await snapshot(root)).toEqual(unitsBefore);

    const bytesReservation = await reserveExtractionBundle(root, "bytes");
    await writeValidBundle(bytesReservation);
    const bytesBefore = await snapshot(root);
    await expect(validateExtractionBundle(bytesReservation, undefined, acquisitionLimits({ publicationBytes: 1 }))).rejects.toMatchObject({ limit: "publication_bytes" });
    expect(await snapshot(root)).toEqual(bytesBefore);
    expect(await readFile(sentinel, "utf8")).toBe("keep");
  });
});
