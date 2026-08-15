import { afterEach, beforeAll, describe, expect, test } from "bun:test";
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
import { runMigrations } from "../src/db/migrate";
import { getSqlite } from "../src/db/client";
import { exportsDir, projectsDir, systemsDir } from "../src/lib/paths";
import { PathBoundaryError } from "../src/security/path-boundary";
import { createApp } from "../src/server";
import { saveSessionAttachments } from "../src/services/attachments";
import {
  indexProjectFiles,
  resolveDrawFile,
  resolveProjectFile,
} from "../src/services/files";
import {
  __resetFilePatchUndoStoreForTests,
  FilePatchError,
  patchHtmlNode,
  undoLastFilePatch,
} from "../src/services/file-patch";

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
    const projectId = insertProject(root);

    const files = await indexProjectFiles(projectId);
    expect(files?.some((file) => file.rel_path.startsWith("linked"))).toBe(false);
  });
});

describe("file patch service", () => {
  const html = '<h1 data-bg-node-id="title">outside</h1>';

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

describe("serve and deletion routes", () => {
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
