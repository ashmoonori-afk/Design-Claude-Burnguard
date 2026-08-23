import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { watch } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMigrations, runMigrationsFrom } from "../src/db/migrate";
import { getSqlite } from "../src/db/sqlite-client";
import { exportsDir, projectsDir, systemsDir } from "../src/lib/paths";
import { PathBoundaryError } from "../src/security/path-boundary";
import { createApp } from "../src/server";
import { attachmentExtractedTextPath, attachmentSummaryPath, saveSessionAttachments } from "../src/services/attachments";
import {
  indexProjectFiles,
  resolveDrawFile,
  resolveProjectFile,
} from "../src/services/managed-project-files";
import {
  __resetFilePatchUndoStoreForTests,
  FilePatchError,
  getFileUndoState,
  parseInlineStyle,
  patchHtmlNode,
  serializeInlineStyle,
  undoLastFilePatch,
} from "../src/services/file-patch";
import { closeProjectWatcher, pendingProjectEmit, pendingProjectReindex, projectSessionIds, projectWatchers } from "../src/services/watcher-registry";

const tempDirs: string[] = [];
const projectIds: string[] = [];
const sessionIds: string[] = [];
const systemIds: string[] = [];
const exportIds: string[] = [];
const distLinks: string[] = [];
let sequence = 0;

function id(prefix: string): string {
  sequence += 1;
  return `bg04-${prefix}-${process.pid}-${sequence}`;
}

async function temp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function insertProject(dirPath: string): string {
  const projectId = id("project");
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO projects
       (id, name, type, design_system_id, dir_path, entrypoint, backend_id, created_at, updated_at)
       VALUES (?, ?, 'prototype', NULL, ?, 'index.html', 'claude-code', ?, ?)`,
    )
    .run(projectId, projectId, dirPath, now, now);
  projectIds.push(projectId);
  return projectId;
}

function insertSession(projectId: string): string {
  const sessionId = id("session");
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO sessions
       (id, project_id, backend_id, status, usage_input_tokens, usage_output_tokens,
        usage_cache_read, usage_cache_write, created_at, updated_at, last_active_at)
       VALUES (?, ?, 'claude-code', 'idle', 0, 0, 0, 0, ?, ?, ?)`,
    )
    .run(sessionId, projectId, now, now, now);
  sessionIds.push(sessionId);
  return sessionId;
}

function insertSystem(dirPath: string): string {
  const systemId = id("system");
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO design_systems
       (id, name, status, source_type, is_template, dir_path, created_at, updated_at)
       VALUES (?, ?, 'draft', 'manual', 0, ?, ?, ?)`,
    )
    .run(systemId, systemId, dirPath, now, now);
  systemIds.push(systemId);
  return systemId;
}

function insertExport(projectId: string, outputPath: string): string {
  const exportId = id("export");
  const now = Date.now();
  getSqlite()
    .prepare(
      `INSERT INTO exports
       (id, project_id, format, status, output_path, size_bytes, created_at, completed_at)
       VALUES (?, ?, 'html_zip', 'succeeded', ?, 6, ?, ?)`,
    )
    .run(exportId, projectId, outputPath, now, now);
  exportIds.push(exportId);
  return exportId;
}

async function makeDirLink(target: string, link: string): Promise<void> {
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
}

beforeAll(async () => {
  await runMigrations();
  await Promise.all([
    mkdir(projectsDir, { recursive: true }),
    mkdir(systemsDir, { recursive: true }),
    mkdir(exportsDir, { recursive: true }),
  ]);
});

afterEach(async () => {
  __resetFilePatchUndoStoreForTests();
  const db = getSqlite();
  for (const exportId of exportIds.splice(0)) {
    db.prepare("DELETE FROM exports WHERE id = ?").run(exportId);
  }
  for (const sessionId of sessionIds.splice(0)) {
    db.prepare("DELETE FROM attachments WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  for (const projectId of projectIds.splice(0)) {
    db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }
  for (const systemId of systemIds.splice(0)) {
    db.prepare("DELETE FROM design_systems WHERE id = ?").run(systemId);
  }
  for (const link of distLinks.splice(0)) {
    await rm(link, { recursive: true, force: true });
  }
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("focused migration execution", () => {
  test("applies a pending migration transaction and records it once", async () => {
    const directory = await temp("bg04-migration-");
    await writeFile(path.join(directory, "0001_test.sql"), "CREATE TABLE focused_gate(id TEXT PRIMARY KEY);", "utf8");
    const db = new Database(":memory:");

    await runMigrationsFrom(db, directory);
    await runMigrationsFrom(db, directory);

    expect(db.query("SELECT id FROM schema_migrations").all()).toEqual([{ id: "0001_test.sql" }]);
    expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='focused_gate'").get()).toEqual({ name: "focused_gate" });
    db.close();
  });
});

describe("project file and draw services", () => {
  test("reject traversal, backslash traversal, absolute paths, and junction escapes", async () => {
    const root = await temp("bg04-project-");
    const outside = await temp("bg04-outside-");
    await writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
    await makeDirLink(outside, path.join(root, "linked"));
    const projectId = insertProject(root);

    for (const hostile of [
      "../secret.txt",
      "..\\secret.txt",
      path.join(outside, "secret.txt"),
      "linked/secret.txt",
    ]) {
      expect(await resolveProjectFile(projectId, hostile)).toBeNull();
    }
  });

  test("rejects draw junction escapes while allowing missing leaves through a symlinked project root", async () => {
    const realProject = await temp("bg04-real-project-");
    const projectLinkParent = await temp("bg04-project-link-");
    const projectLink = path.join(projectLinkParent, "project");
    await makeDirLink(realProject, projectLink);
    const outside = await temp("bg04-draw-outside-");
    await mkdir(path.join(realProject, ".meta", "draws"), { recursive: true });
    await makeDirLink(outside, path.join(realProject, ".meta", "draws", "linked"));
    const projectId = insertProject(projectLink);

    expect(await resolveDrawFile(projectId, "linked/note")).toBeNull();
    const safe = await resolveDrawFile(projectId, "new/note");
    expect(safe?.absolutePath).toBe(path.join(realProject, ".meta", "draws", "new", "note.svg"));
  });

  test("does not index a symlink whose target leaves the project", async () => {
    const root = await temp("bg04-index-project-");
    const outside = await temp("bg04-index-outside-");
    await writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
    await makeDirLink(outside, path.join(root, "linked"));
    await mkdir(path.join(root, "nested"));
    await Promise.all([
      writeFile(path.join(root, "index.html"), "<p/>", "utf8"),
      writeFile(path.join(root, "style.css"), ":root{}", "utf8"),
      writeFile(path.join(root, "script.ts"), "export {};", "utf8"),
      writeFile(path.join(root, "readme.md"), "# readme", "utf8"),
      writeFile(path.join(root, "image.png"), "png", "utf8"),
      writeFile(path.join(root, "other.bin"), "bin", "utf8"),
      writeFile(path.join(root, ".page.1.2.tmp"), "temp", "utf8"),
    ]);
    const projectId = insertProject(root);

    const files = await indexProjectFiles(projectId);
    expect(files?.some((file) => file.rel_path.startsWith("linked"))).toBe(false);
    expect(files?.map((file) => file.category)).toEqual(["asset", "html", "folder", "other", "document", "script", "stylesheet"]);
  });
});

describe("file patch service", () => {
  const html = '<h1 data-bg-node-id="title">outside</h1>';

  test("commits and exactly undoes a valid managed HTML patch", async () => {
    const root = await temp("bg04-patch-valid-");
    await writeFile(path.join(root, "page.html"), html, "utf8");
    const projectId = insertProject(root);

    const patched = await patchHtmlNode(projectId, "page.html", { node_bg_id: "title", text: "inside" });
    const undone = await undoLastFilePatch(projectId, "page.html");

    expect(patched.updatedAt).toBeGreaterThan(0);
    expect(undone).not.toBeNull();
    expect(await readFile(path.join(root, "page.html"), "utf8")).toBe(html);
  });

  test("parses nested inline styles and reports empty undo state deterministically", () => {
    const styles = parseInlineStyle("background: linear-gradient(red, blue); font-family: 'A; B'; color: var(--x, red)");

    expect(styles).toEqual({ background: "linear-gradient(red, blue)", "font-family": "'A; B'", color: "var(--x, red)" });
    expect(serializeInlineStyle(styles)).toBe("background: linear-gradient(red, blue); font-family: 'A; B'; color: var(--x, red)");
    expect(getFileUndoState("missing", "page.html")).toEqual({ can_undo: false, stored_at: null });
  });

  test("does not patch HTML through a junction outside the project", async () => {
    const root = await temp("bg04-patch-project-");
    const outside = await temp("bg04-patch-outside-");
    const outsideFile = path.join(outside, "page.html");
    await writeFile(outsideFile, html, "utf8");
    await makeDirLink(outside, path.join(root, "linked"));
    const projectId = insertProject(root);

    await expect(
      patchHtmlNode(projectId, "linked/page.html", {
        node_bg_id: "title",
        text: "pwned",
      }),
    ).rejects.toMatchObject({ code: "file_not_found" } satisfies Partial<FilePatchError>);
    expect(await readFile(outsideFile, "utf8")).toBe(html);
  });

  test("revalidates containment before undoing a prior patch", async () => {
    const root = await temp("bg04-undo-project-");
    const inside = path.join(root, "inside");
    const outside = await temp("bg04-undo-outside-");
    await mkdir(inside);
    await writeFile(path.join(inside, "page.html"), html, "utf8");
    await writeFile(path.join(outside, "page.html"), html, "utf8");
    const link = path.join(root, "linked");
    await makeDirLink(inside, link);
    const projectId = insertProject(root);
    await patchHtmlNode(projectId, "linked/page.html", {
      node_bg_id: "title",
      text: "inside patch",
    });
    await rm(link, { recursive: true, force: true });
    await makeDirLink(outside, link);

    expect(await undoLastFilePatch(projectId, "linked/page.html")).toBeNull();
    expect(await readFile(path.join(outside, "page.html"), "utf8")).toBe(html);
  });
});

describe("watcher registry cleanup", () => {
  test("closes watcher timers emits and session cache for a deleted project", async () => {
    const root = await temp("bg04-watcher-registry-");
    const projectId = id("watcher-registry");
    const watcher = watch(root);
    projectWatchers.set(projectId, watcher);
    pendingProjectReindex.set(projectId, setTimeout(() => undefined, 10_000));
    pendingProjectEmit.set(`${projectId}:index.html`, setTimeout(() => undefined, 10_000));
    projectSessionIds.set(projectId, "session");

    closeProjectWatcher(projectId);

    expect([projectWatchers.has(projectId), pendingProjectReindex.has(projectId), pendingProjectEmit.has(`${projectId}:index.html`), projectSessionIds.has(projectId)]).toEqual([false, false, false, false]);
  });
});

describe("serve and deletion routes", () => {
  test("serves the built application shell and a real bundled asset through production static routing", async () => {
    const dist = path.join(import.meta.dir, "..", "..", "frontend", "dist");
    const assets = (await readdir(path.join(dist, "assets"))).filter((name) => !name.startsWith("."));
    const asset = assets[0];
    expect(asset).toBeDefined();
    if (asset === undefined) return;

    const app = createApp();
    const shell = await app.request("/");
    const bundled = await app.request(`/assets/${asset}`);

    expect([shell.status, bundled.status]).toEqual([200, 200]);
    expect(shell.headers.get("content-type")).toContain("text/html");
    expect((await bundled.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("returns typed missing states from every project registration route", async () => {
    const missing = id("missing-project");
    const app = createApp();

    const detail = await app.request(`/api/projects/${missing}`);
    const session = await app.request(`/api/projects/${missing}/session`);
    const deletion = await app.request(`/api/projects/${missing}`, { method: "DELETE" });

    expect([detail.status, session.status, deletion.status]).toEqual([404, 404, 404]);
  });

  test("serves valid project files draws export downloads and project registration through decomposed production routes", async () => {
    const root = await temp("bg04-valid-project-");
    await mkdir(path.join(root, ".meta", "draws"), { recursive: true });
    await writeFile(path.join(root, "index.html"), "<h1>valid</h1>", "utf8");
    const projectId = insertProject(root);
    const sessionId = insertSession(projectId);
    const outputDir = path.join(exportsDir, id("valid-output"));
    tempDirs.push(outputDir);
    await mkdir(outputDir, { recursive: true });
    const output = path.join(outputDir, "valid.zip");
    await writeFile(output, "archive", "utf8");
    const exportId = insertExport(projectId, output);
    const app = createApp();

    const project = await app.request(`/api/projects/${projectId}`);
    const session = await app.request(`/api/projects/${projectId}/session`);
    const file = await app.request(`/api/projects/${projectId}/fs/index.html`);
    const emptyDraw = await app.request(`/api/projects/${projectId}/draws/note`);
    const savedDraw = await app.request(`/api/projects/${projectId}/draws/note`, { method: "PUT", body: "<svg/>" });
    const draw = await app.request(`/api/projects/${projectId}/draws/note`);
    const download = await app.request(`/api/exports/${exportId}/download`);

    expect([project.status, session.status, file.status, emptyDraw.status, savedDraw.status, draw.status, download.status]).toEqual([200, 200, 200, 200, 200, 200, 200]);
    expect(await file.text()).toBe("<h1>valid</h1>");
    expect(await emptyDraw.text()).toContain("<svg");
    expect(await draw.text()).toBe("<svg/>");
    expect(await download.text()).toBe("archive");
    expect(sessionId).not.toBe("");
  });

  test("rejects project file and draw junction escapes at HTTP sinks", async () => {
    const root = await temp("bg04-route-project-");
    const outside = await temp("bg04-route-outside-");
    await writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
    await writeFile(path.join(outside, "note.svg"), "<svg>secret</svg>", "utf8");
    await makeDirLink(outside, path.join(root, "linked"));
    await mkdir(path.join(root, ".meta", "draws"), { recursive: true });
    await makeDirLink(outside, path.join(root, ".meta", "draws", "linked"));
    const projectId = insertProject(root);
    const app = createApp();

    expect((await app.request(`/api/projects/${projectId}/fs/linked/secret.txt`)).status).toBe(404);
    expect((await app.request(`/api/projects/${projectId}/draws/linked/note`)).status).toBe(404);
    expect(
      (
        await app.request(`/api/projects/${projectId}/draws/linked/new-note`, {
          method: "PUT",
          body: "<svg/>",
        })
      ).status,
    ).toBe(400);
  });

  test("does not serve an export output_path outside the managed exports root", async () => {
    const root = await temp("bg04-export-project-");
    const outside = await temp("bg04-export-outside-");
    const outsideFile = path.join(outside, "secret.zip");
    await writeFile(outsideFile, "secret", "utf8");
    const projectId = insertProject(root);
    const exportId = insertExport(projectId, outsideFile);

    const response = await createApp().request(`/api/exports/${exportId}/download`);
    expect(response.status).toBe(404);
  });

  test("does not recursively delete a project path outside the managed projects root", async () => {
    const outside = await temp("bg04-delete-project-");
    await writeFile(path.join(outside, "victim.txt"), "keep", "utf8");
    const projectId = insertProject(outside);

    const response = await createApp().request(`/api/projects/${projectId}`, { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await readFile(path.join(outside, "victim.txt"), "utf8")).toBe("keep");
  });

  test("does not recursively delete a design-system path outside the managed systems root", async () => {
    const outside = await temp("bg04-delete-system-");
    await writeFile(path.join(outside, "victim.txt"), "keep", "utf8");
    const systemId = insertSystem(outside);

    const response = await createApp().request(`/api/design-systems/${systemId}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await readFile(path.join(outside, "victim.txt"), "utf8")).toBe("keep");
  });

  test("does not serve a design-system file through an escaping junction", async () => {
    const root = await temp("bg04-system-root-");
    const outside = await temp("bg04-system-outside-");
    await writeFile(path.join(outside, "secret.css"), "secret", "utf8");
    await makeDirLink(outside, path.join(root, "linked"));
    const systemId = insertSystem(root);

    const response = await createApp().request(`/api/design-systems/${systemId}/files/linked/secret.css`);
    expect(response.status).toBe(404);
  });

  test("does not serve a static asset through an escaping junction", async () => {
    const outside = await temp("bg04-static-outside-");
    await writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
    const linkName = id("static-link");
    const link = path.join(import.meta.dir, "..", "..", "frontend", "dist", "assets", linkName);
    await makeDirLink(outside, link);
    distLinks.push(link);

    const response = await createApp().request(`/assets/${linkName}/secret.txt`);
    expect(response.status).toBe(404);
  });
});

describe("attachments service", () => {
  test("rejects missing sessions and attachment-count overflow before writing bytes", async () => {
    const root = await temp("bg04-attachment-limits-");
    const projectId = insertProject(root);
    const sessionId = insertSession(projectId);
    const files = Array.from({ length: 9 }, (_, index) => new File(["x"], `note-${index}.txt`, { type: "text/plain" }));

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.bin");
    await expect(saveSessionAttachments("missing-session", [files[0] ?? new File([], "missing")])).rejects.toThrow("session_not_found");
    await expect(saveSessionAttachments(sessionId, files)).rejects.toThrow("attachment_limit_exceeded");
    await expect(saveSessionAttachments(sessionId, [oversized])).rejects.toThrow("attachment_too_large");
    expect(attachmentSummaryPath("file")).toBe("file.summary.json");
    expect(attachmentExtractedTextPath("file")).toBe("file.extracted.md");
    expect(await readdir(root)).toEqual([]);
  });

  test("stores a bounded ordinary attachment through the focused attachment boundary", async () => {
    const root = await temp("bg04-attachment-valid-");
    const projectId = insertProject(root);
    const sessionId = insertSession(projectId);

    const records = await saveSessionAttachments(sessionId, [new File(["content"], "note.txt", { type: "text/plain" })]);

    expect(records).toHaveLength(1);
    expect(await readFile(records[0] ?? "", "utf8")).toBe("content");
    expect(getSqlite().query("SELECT original_name,size_bytes FROM attachments WHERE session_id=?").get(sessionId)).toEqual({ original_name: "note.txt", size_bytes: 7 });
  });

  test("rejects a symlinked .attachments directory before writing any upload", async () => {
    const root = await temp("bg04-attachment-project-");
    const outside = await temp("bg04-attachment-outside-");
    await makeDirLink(outside, path.join(root, ".attachments"));
    const projectId = insertProject(root);
    const sessionId = insertSession(projectId);

    await expect(
      saveSessionAttachments(sessionId, [new File(["secret"], "../../secret.txt", { type: "text/plain" })]),
    ).rejects.toBeInstanceOf(PathBoundaryError);
    expect(await readdir(outside)).toEqual([]);
  });
});
