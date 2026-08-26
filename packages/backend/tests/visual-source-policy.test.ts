import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { getSqlite } from "../src/db/sqlite-client";
import { buildPrompt } from "../src/harness/prompt-builder";
import { parsePersistedNormalizedEvent, parsePersistedUserEvent } from "../src/db/event-sequence-repository";
import { parseVisualSourceUploadRequest } from "@bg/shared";
import { ensureLearningSchema } from "./learning-fixture";
import { buildVisualSourceManifest } from "../src/services/visual-source-manifest";

type BuildContext = Parameters<typeof buildPrompt>[0];
type Attachment = BuildContext["attachments"][number];

let root = "";
let filePath = "";
let digest = "";

beforeAll(async () => {
  ensureLearningSchema(getSqlite());
  root = await mkdtemp(path.join(tmpdir(), "burnguard-visual-source-policy-"));
  await mkdir(path.join(root, ".attachments"));
  filePath = path.join(root, ".attachments", "deck.pdf");
  const bytes = new TextEncoder().encode("visual-source");
  digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(filePath, bytes);
});

afterAll(async () => rm(root, { recursive: true, force: true }));

function context(attachment: Attachment): BuildContext {
  return {
    project: {
      project_id: "visual-project",
      project_name: "Visual sources",
      project_type: "other",
      project_dir: root,
      entrypoint: "index.html",
      options_json: null,
      current_revision: 0,
      current_digest: null,
    },
    designSystem: null,
    files: [],
    attachments: [attachment],
    openComments: [],
  };
}

function source(role: "ordinary_content" | "immutable_reference"): Attachment {
  return {
    id: "attachment-1",
    session_id: "session-1",
    turn_id: "turn-1",
    file_path: filePath,
    mime_type: "application/pdf",
    original_name: "deck.pdf",
    size_bytes: 13,
    sha256: digest,
    source_role: role,
    source_role_explicit: true,
    created_at: 1,
  };
}

function manifest(prompt: string): Readonly<Record<string, unknown>> {
  const match = prompt.match(/<burnguard-visual-sources-v1>\n([^\n]+)\n<\/burnguard-visual-sources-v1>/u);
  expect(match).not.toBeNull();
  return JSON.parse(match?.[1] ?? "{}") as Readonly<Record<string, unknown>>;
}

describe("visual source upload boundary", () => {
  test("Given omitted metadata When parsed Then every upload defaults to ordinary content", () => {
    expect(parseVisualSourceUploadRequest(undefined, 2)).toEqual({
      schema_version: 1,
      explicit: false,
      sources: [
        { source_type: "upload", upload_id: "upload-0", file_index: 0, role: "ordinary_content" },
        { source_type: "upload", upload_id: "upload-1", file_index: 1, role: "ordinary_content" },
      ],
    });
  });

  test("Given an explicit immutable role When parsed Then its file index remains typed", () => {
    expect(parseVisualSourceUploadRequest(JSON.stringify({
      schema_version: 1,
      sources: [{ source_type: "upload", upload_id: "deck", file_index: 0, role: "immutable_reference" }],
    }), 1)).toEqual({
      schema_version: 1,
      explicit: true,
      sources: [{ source_type: "upload", upload_id: "deck", file_index: 0, role: "immutable_reference" }],
    });
  });

  test("Given URL web or stock metadata When parsed Then the unsupported source is rejected", () => {
    for (const sourceType of ["url", "web", "stock"]) {
      expect(() => parseVisualSourceUploadRequest(JSON.stringify({
        schema_version: 1,
        sources: [{ source_type: sourceType, url: "https://example.test/image" }],
      }), 1)).toThrow("unsupported_visual_source");
    }
  });

  test("Given duplicate missing or path-shaped upload metadata When parsed Then it fails closed", () => {
    const invalid = [
      { schema_version: 1, sources: [] },
      { schema_version: 1, sources: [{ source_type: "upload", upload_id: "same", file_index: 0, role: "ordinary_content" }, { source_type: "upload", upload_id: "same", file_index: 0, role: "immutable_reference" }] },
      { schema_version: 1, sources: [{ source_type: "upload", upload_id: "deck", file_index: 0, role: "ordinary_content", path: "../../escape.pdf" }] },
    ];
    for (const value of invalid) {
      expect(() => parseVisualSourceUploadRequest(JSON.stringify(value), 1)).toThrow("invalid_visual_sources");
    }
  });
});

describe("visual source persistence and prompt", () => {
  test("Given persisted source selection When replayed Then role and attachment provenance survive", () => {
    const event = parsePersistedUserEvent(JSON.stringify({
      type: "user.message",
      text: "use it",
      attachments: [filePath],
      visualSources: [{ source_type: "uploaded_attachment", attachment_path: filePath, role: "immutable_reference" }],
    }), "event-1");

    expect(event).toMatchObject({
      visualSources: [{ source_type: "uploaded_attachment", role: "immutable_reference" }],
    });
  });

  test("Given a normalized user message manifest When replayed Then immutable provenance remains machine-readable", () => {
    const visualSources = {
      schema_version: 1,
      network_sources: "unsupported",
      sources: [{
        source_type: "uploaded_attachment",
        role: "immutable_reference",
        attachment_id: "attachment-1",
        original_name: "deck.pdf",
        mime_type: "application/pdf",
        size_bytes: 13,
        preflight_verified_sha256: digest,
        managed_path: ".attachments/deck.pdf",
        role_origin: "explicit",
        provenance: { session_id: "session-1", turn_id: "turn-1", storage: "managed_attachment" },
        policy: { original_file: "preserve", original_hash: "preserve", never_overwrite: true, never_copy_into_authored_output: true, derived_artifact: "separate" },
      }],
    };

    const event = parsePersistedNormalizedEvent(JSON.stringify({ id: "down-1", ts: 1, type: "chat.user_message", turnId: "turn-1", text: "use it", attachmentCount: 1, visualSources }), "down-1");

    expect(event).toMatchObject({ type: "chat.user_message", visualSources });
    expect(JSON.stringify(event)).not.toContain(root);
    expect(JSON.stringify(event)).not.toContain(".burnguard-inputs");
  });

  test("Given a prebuilt turn manifest and private input When prompting Then agent-only absolute snapshot path is used without a second source read", async () => {
    const attachment = source("immutable_reference");
    const selection = [{ source_type: "uploaded_attachment" as const, attachment_path: filePath, role: "immutable_reference" as const }];
    const built = await buildVisualSourceManifest({ projectDir: root, attachments: [attachment], requestedPaths: [filePath], selections: selection });
    const moved = `${filePath}.moved`;
    await rename(filePath, moved);
    try {
      const stagePath = path.join(root, ".meta", "artifact-operations", "operation-1", "inputs-private", "attachment-1-deck.pdf");
      const prompt = await buildPrompt(context(attachment), { type: "user.message", text: "use", attachments: [filePath], visualSources: selection }, { visualSourceManifest: built, stageAttachmentInputs: [{ attachmentId: attachment.id, attachmentPath: filePath, sourcePath: stagePath, extractedTextPath: null, immutable: true, sourceSha256: digest, sourceSize: 13 }] });
      expect(manifest(prompt)["sources"]).toEqual([expect.objectContaining({ managed_path: stagePath })]);
      expect(prompt).toContain(stagePath);
      expect(prompt).not.toContain(filePath);
      expect(prompt).not.toContain(`${root}/.attachments`);
      expect(JSON.stringify(built)).not.toContain(stagePath);
    } finally {
      await rename(moved, filePath);
    }
  });

  test("Given ordinary content When prompting Then existing attachment behavior remains and no immutable policy is asserted", async () => {
    const prompt = await buildPrompt(context(source("ordinary_content")), {
      type: "user.message",
      text: "summarize",
      attachments: [filePath],
      visualSources: [{ source_type: "uploaded_attachment", attachment_path: filePath, role: "ordinary_content" }],
    });

    const block = manifest(prompt);
    expect(block["sources"]).toEqual([expect.objectContaining({ role: "ordinary_content", preflight_verified_sha256: digest })]);
    expect(JSON.stringify(block)).not.toContain("never_overwrite");
    expect(prompt).not.toContain("<burnguard-reference-layout-v1>");
  });

  test("Given an immutable uploaded reference When prompting Then original identity provenance and separation policy are closed", async () => {
    const prompt = await buildPrompt(context(source("immutable_reference")), {
      type: "user.message",
      text: "use this reference",
      attachments: [filePath],
      visualSources: [{ source_type: "uploaded_attachment", attachment_path: filePath, role: "immutable_reference" }],
    });

    expect(prompt).toContain("<burnguard-reference-layout-v1>");
    expect(manifest(prompt)).toEqual({
      schema_version: 1,
      network_sources: "unsupported",
      sources: [{
        source_type: "uploaded_attachment",
        role: "immutable_reference",
        attachment_id: "attachment-1",
        original_name: "deck.pdf",
        mime_type: "application/pdf",
        size_bytes: 13,
        preflight_verified_sha256: digest,
        managed_path: ".attachments/deck.pdf",
        role_origin: "explicit",
        provenance: { session_id: "session-1", turn_id: "turn-1", storage: "managed_attachment" },
        policy: {
          original_file: "preserve",
          original_hash: "preserve",
          never_overwrite: true,
          never_copy_into_authored_output: true,
          derived_artifact: "separate",
        },
      }],
    });
  });

  test("Given a selected attachment outside managed storage or with invalid hash provenance When prompting Then it is rejected", async () => {
    const escaped = { ...source("immutable_reference"), file_path: "/tmp/escape.pdf" };
    const badHash = { ...source("immutable_reference"), sha256: "not-a-sha" };
    for (const attachment of [escaped, badHash]) {
      await expect(buildPrompt(context(attachment), {
        type: "user.message",
        text: "use it",
        attachments: [attachment.file_path],
        visualSources: [{ source_type: "uploaded_attachment", attachment_path: attachment.file_path, role: "immutable_reference" }],
      })).rejects.toThrow("invalid_visual_source_provenance");
    }
  });
});
