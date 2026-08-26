import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../src/api/client";
import {
  planAttachmentIntake,
  readyAttachmentSources,
  setAttachmentRole,
  visualSourceSendErrorCopy,
} from "../src/components/chat/attachment-intake";
import { listExistingVisualSources } from "../src/components/chat/visual-source-selection";

function file(name: string, type = "application/pdf"): File {
  return new File([new Uint8Array(8)], name, { type });
}

describe("composer visual source roles", () => {
  test("Given a supported upload When queued Then ordinary content is the default", () => {
    const items = planAttachmentIntake([], [file("deck.pdf")]);

    expect(readyAttachmentSources(items)).toEqual([{ id: expect.any(String), file: expect.any(File), role: "ordinary_content" }]);
  });

  test("Given a ready PDF or PPTX When marked as reference Then immutable role crosses the send model", () => {
    const queued = planAttachmentIntake([], [file("deck.pptx")]);
    const id = queued[0]?.id ?? "missing";
    const items = setAttachmentRole(queued, id, "immutable_reference");

    expect(readyAttachmentSources(items)).toEqual([{ id, file: expect.any(File), role: "immutable_reference" }]);
  });

  test("Given internal provenance errors When mapped for the project toast Then bounded copy hides internal details", () => {
    const copy = visualSourceSendErrorCopy(new ApiError("invalid_visual_source_provenance", "raw /tmp/private", 409));
    expect(copy).not.toContain("invalid_visual_source_provenance");
    expect(copy).not.toContain("/tmp/private");
  });

  test("Given duplicate filenames When one stable item is marked Then only that upload changes role", () => {
    const queued = planAttachmentIntake([], [file("deck.pdf"), file("deck.pdf")]);
    const secondId = queued[1]?.id ?? "missing";

    const sources = readyAttachmentSources(setAttachmentRole(queued, secondId, "immutable_reference"));

    expect(sources.map((source) => [source.id, source.role])).toEqual([
      [queued[0]?.id, "ordinary_content"],
      [secondId, "immutable_reference"],
    ]);
  });
});

describe("existing local visual source disclosure", () => {
  test("Given indexed managed files When listed Then only safe visual candidates appear as editable project files", () => {
    const sources = listExistingVisualSources([
      { rel_path: "assets/hero.png", category: "asset", hash: "a".repeat(64) },
      { rel_path: "docs/reference.pdf", category: "other", hash: "b".repeat(64) },
      { rel_path: "slides/source.pptx", category: "other", hash: "c".repeat(64) },
      { rel_path: "index.html", category: "html", hash: "d".repeat(64) },
      { rel_path: "../escape.png", category: "asset", hash: "e".repeat(64) },
      { rel_path: "assets/unhashed.webp", category: "asset", hash: null },
    ]);

    expect(sources).toEqual([
      { source_type: "existing_project_file", rel_path: "assets/hero.png", status: "editable", sha256: "a".repeat(64) },
      { source_type: "existing_project_file", rel_path: "docs/reference.pdf", status: "editable", sha256: "b".repeat(64) },
      { source_type: "existing_project_file", rel_path: "slides/source.pptx", status: "editable", sha256: "c".repeat(64) },
    ]);
  });

  test("Given narrow controls and a long inventory When inspected Then controls are touch-sized and inventory scrolls without truncation", async () => {
    const attachments = await readFile(path.join(import.meta.dir, "../src/components/chat/ComposerAttachments.tsx"), "utf8");
    const candidates = await readFile(path.join(import.meta.dir, "../src/components/chat/VisualSourceCandidates.tsx"), "utf8");
    expect(attachments).toContain("max-[900px]:min-h-11");
    expect(attachments).toContain("max-[900px]:min-w-11");
    expect(attachments).toContain("focus-visible:ring-2");
    expect(attachments).toContain("text-xs");
    expect(candidates).toContain("overflow-y-auto");
    expect(candidates).not.toContain("slice(0, 4)");
  });
});
