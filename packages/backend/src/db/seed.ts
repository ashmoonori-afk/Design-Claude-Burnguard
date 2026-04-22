import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type {
  BackendId,
  DesignSystemDetail,
  DesignSystemSummary,
  ProjectDetail,
  ProjectSummary,
  SessionInfo,
} from "@bg/shared";
import { APP_VERSION } from "@bg/shared";
import { getDb } from "./client";
import {
  designSystemsTable,
  metaSchemaTable,
  projectsTable,
  sessionsTable,
  usersTable,
} from "./schema";
import { homeDesignSystemFixtures, homeProjectFixtures } from "../data/home";
import { projectsDir, systemsDir } from "../lib/paths";

export async function seedCoreData() {
  const db = getDb();
  const now = Date.now();

  await db
    .insert(usersTable)
    .values({
      id: "local",
      displayName: "You",
      createdAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(metaSchemaTable)
    .values({ key: "app_version", value: APP_VERSION })
    .onConflictDoUpdate({
      target: metaSchemaTable.key,
      set: { value: APP_VERSION },
    });

  for (const system of homeDesignSystemFixtures) {
    const isSample = system.id === "goldman-sachs";
    const dirPath = isSample
      ? path.join(systemsDir, "goldman-sachs")
      : path.join(systemsDir, system.id);

    await db
      .insert(designSystemsTable)
      .values({
        id: system.id,
        name: system.name,
        description: null,
        status: system.status,
        sourceType: isSample ? "sample" : "manual",
        sourceUri: null,
        isTemplate: system.is_template,
        dirPath,
        skillMdPath: isSample ? path.join(dirPath, "SKILL.md") : null,
        tokensCssPath: isSample ? path.join(dirPath, "colors_and_type.css") : null,
        readmeMdPath: isSample ? path.join(dirPath, "README.md") : null,
        thumbnailPath: system.thumbnail_path,
        createdAt: system.updated_at,
        updatedAt: system.updated_at,
        archivedAt: null,
      })
      .onConflictDoUpdate({
        target: designSystemsTable.id,
        set: {
          name: system.name,
          status: system.status,
          isTemplate: system.is_template,
          dirPath,
          skillMdPath: isSample ? path.join(dirPath, "SKILL.md") : null,
          tokensCssPath: isSample ? path.join(dirPath, "colors_and_type.css") : null,
          readmeMdPath: isSample ? path.join(dirPath, "README.md") : null,
          thumbnailPath: system.thumbnail_path,
          updatedAt: system.updated_at,
        },
      });
  }

  const existingProjects = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .limit(1);

  if (existingProjects.length > 0) return;

  for (const project of homeProjectFixtures) {
    const dirPath = path.join(projectsDir, project.id);
    await mkdir(path.join(dirPath, ".attachments"), { recursive: true });
    await mkdir(path.join(dirPath, ".meta", "checkpoints"), { recursive: true });

    await db.insert(projectsTable).values({
      id: project.id,
      name: project.name,
      type: project.type,
      designSystemId: project.design_system_id,
      dirPath,
      entrypoint: project.type === "slide_deck" ? "deck.html" : "index.html",
      thumbnailPath: project.thumbnail_path,
      backendId: "claude-code",
      optionsJson: null,
      archivedAt: project.archived_at,
      createdAt: project.updated_at,
      updatedAt: project.updated_at,
    });

    await db.insert(sessionsTable).values({
      id: ulid(),
      projectId: project.id,
      backendId: "claude-code",
      status: "idle",
      createdAt: project.updated_at,
      updatedAt: project.updated_at,
      lastActiveAt: project.updated_at,
    });
  }
}

export async function listHomeProjects(tab: string, limit: number, offset: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      type: projectsTable.type,
      design_system_id: projectsTable.designSystemId,
      design_system_name: designSystemsTable.name,
      thumbnail_path: projectsTable.thumbnailPath,
      updated_at: projectsTable.updatedAt,
      archived_at: projectsTable.archivedAt,
    })
    .from(projectsTable)
    .leftJoin(
      designSystemsTable,
      eq(projectsTable.designSystemId, designSystemsTable.id),
    )
    .where(isNull(projectsTable.archivedAt))
    .orderBy(desc(projectsTable.updatedAt));

  const filtered =
    tab === "examples"
      ? rows.filter((row) => row.type === "from_template")
      : rows;

  return {
    items: filtered.slice(offset, offset + limit) as ProjectSummary[],
    total: filtered.length,
  };
}

export async function listHomeDesignSystems(status: DesignSystemSummary["status"]) {
  const db = getDb();
  const rows = await db
    .select({
      id: designSystemsTable.id,
      name: designSystemsTable.name,
      status: designSystemsTable.status,
      is_template: designSystemsTable.isTemplate,
      thumbnail_path: designSystemsTable.thumbnailPath,
      updated_at: designSystemsTable.updatedAt,
    })
    .from(designSystemsTable)
    .where(
      and(eq(designSystemsTable.status, status), isNull(designSystemsTable.archivedAt)),
    )
    .orderBy(desc(designSystemsTable.updatedAt));

  return rows as DesignSystemSummary[];
}

export async function getDesignSystemDetail(systemId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: designSystemsTable.id,
      name: designSystemsTable.name,
      description: designSystemsTable.description,
      status: designSystemsTable.status,
      is_template: designSystemsTable.isTemplate,
      thumbnail_path: designSystemsTable.thumbnailPath,
      updated_at: designSystemsTable.updatedAt,
      source_type: designSystemsTable.sourceType,
      source_uri: designSystemsTable.sourceUri,
      dir_path: designSystemsTable.dirPath,
      skill_md_path: designSystemsTable.skillMdPath,
      tokens_css_path: designSystemsTable.tokensCssPath,
      readme_md_path: designSystemsTable.readmeMdPath,
      archived_at: designSystemsTable.archivedAt,
    })
    .from(designSystemsTable)
    .where(eq(designSystemsTable.id, systemId))
    .limit(1);

  return (rows[0] ?? null) as DesignSystemDetail | null;
}

export async function createProjectRecord(input: {
  name: string;
  type: ProjectSummary["type"];
  designSystemId: string | null;
  backendId: BackendId;
  optionsJson: string | null;
  entrypoint: string;
  thumbnailPath: string | null;
}) {
  const db = getDb();
  const now = Date.now();
  const projectId = ulid();
  const sessionId = ulid();
  const dirPath = path.join(projectsDir, projectId);

  await mkdir(path.join(dirPath, ".attachments"), { recursive: true });
  await mkdir(path.join(dirPath, ".meta", "checkpoints"), { recursive: true });
  await writeFile(
    path.join(dirPath, input.entrypoint),
    createInitialArtifact(input.name, input.type),
    "utf8",
  );

  await db.insert(projectsTable).values({
    id: projectId,
    name: input.name,
    type: input.type,
    designSystemId: input.designSystemId,
    dirPath,
    entrypoint: input.entrypoint,
    thumbnailPath: input.thumbnailPath,
    backendId: input.backendId,
    optionsJson: input.optionsJson,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  await db.insert(sessionsTable).values({
    id: sessionId,
    projectId,
    backendId: input.backendId,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  });

  return {
    id: projectId,
    session_id: sessionId,
    dir_path: dirPath,
    entrypoint: input.entrypoint,
  };
}

export async function getProjectDetail(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      type: projectsTable.type,
      design_system_id: projectsTable.designSystemId,
      design_system_name: designSystemsTable.name,
      thumbnail_path: projectsTable.thumbnailPath,
      updated_at: projectsTable.updatedAt,
      archived_at: projectsTable.archivedAt,
      dir_path: projectsTable.dirPath,
      entrypoint: projectsTable.entrypoint,
      backend_id: projectsTable.backendId,
      options_json: projectsTable.optionsJson,
    })
    .from(projectsTable)
    .leftJoin(
      designSystemsTable,
      eq(projectsTable.designSystemId, designSystemsTable.id),
    )
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  return (rows[0] ?? null) as ProjectDetail | null;
}

export async function getLatestProjectSession(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: sessionsTable.id,
      project_id: sessionsTable.projectId,
      backend_id: sessionsTable.backendId,
      status: sessionsTable.status,
      updated_at: sessionsTable.updatedAt,
      last_active_at: sessionsTable.lastActiveAt,
      input: sessionsTable.usageInputTokens,
      output: sessionsTable.usageOutputTokens,
      cached: sessionsTable.usageCacheRead,
      cache_write: sessionsTable.usageCacheWrite,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.projectId, projectId))
    .orderBy(desc(sessionsTable.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    backend_id: row.backend_id,
    status: row.status,
    usage: {
      input: row.input,
      output: row.output,
      cached: row.cached,
      cache_write: row.cache_write,
    },
    updated_at: row.updated_at,
    last_active_at: row.last_active_at,
  } satisfies SessionInfo;
}

export async function getSessionInfo(sessionId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: sessionsTable.id,
      project_id: sessionsTable.projectId,
      backend_id: sessionsTable.backendId,
      status: sessionsTable.status,
      updated_at: sessionsTable.updatedAt,
      last_active_at: sessionsTable.lastActiveAt,
      input: sessionsTable.usageInputTokens,
      output: sessionsTable.usageOutputTokens,
      cached: sessionsTable.usageCacheRead,
      cache_write: sessionsTable.usageCacheWrite,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    backend_id: row.backend_id,
    status: row.status,
    usage: {
      input: row.input,
      output: row.output,
      cached: row.cached,
      cache_write: row.cache_write,
    },
    updated_at: row.updated_at,
    last_active_at: row.last_active_at,
  } satisfies SessionInfo;
}

export async function listProjectIds() {
  const db = getDb();
  const rows = await db.select({ id: projectsTable.id }).from(projectsTable);
  return rows.map((row) => row.id);
}

function createInitialArtifact(
  projectName: string,
  type: ProjectSummary["type"],
) {
  const title = escapeHtml(projectName);
  const heading =
    type === "slide_deck" ? "Start a new deck" : "Start a new prototype";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f1e8; color: #18232d; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 48px; }
    section { max-width: 920px; background: #fffdf9; border: 1px solid #e7dece; border-radius: 24px; padding: 56px; box-shadow: 0 20px 60px rgba(24,35,45,0.08); }
    .eyebrow { color: #e06b4c; text-transform: uppercase; letter-spacing: 0.16em; font-size: 12px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 52px; line-height: 0.96; letter-spacing: -0.04em; }
    p { margin-top: 20px; font-size: 18px; line-height: 1.7; color: #52616c; }
  </style>
</head>
<body>
  <main>
    <section data-bg-node-id="starter-root">
      <div class="eyebrow">BurnGuard Starter</div>
      <h1 data-bg-node-id="starter-title">${heading}</h1>
      <p data-bg-node-id="starter-copy">Project: ${title}. Send your first prompt in chat to generate the first revision.</p>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
