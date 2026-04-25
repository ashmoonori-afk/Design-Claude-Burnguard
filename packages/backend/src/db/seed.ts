import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type {
  BackendId,
  DesignSystemDetail,
  DesignSystemSourceType,
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
import { renderInitialArtifact } from "./templates";
import type { SlideDeckOptions } from "./templates/slide-deck";

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
    const isSample = system.id === "northvale-capital";
    const dirPath = isSample
      ? path.join(systemsDir, "northvale-capital")
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

export async function createDesignSystemRecord(input: {
  id: string;
  name: string;
  description: string | null;
  status: DesignSystemSummary["status"];
  sourceType: DesignSystemSourceType;
  sourceUri: string | null;
  isTemplate?: boolean;
  dirPath: string;
  skillMdPath: string | null;
  tokensCssPath: string | null;
  readmeMdPath: string | null;
  thumbnailPath: string | null;
}) {
  const db = getDb();
  const now = Date.now();
  await db.insert(designSystemsTable).values({
    id: input.id,
    name: input.name,
    description: input.description,
    status: input.status,
    sourceType: input.sourceType,
    sourceUri: input.sourceUri,
    isTemplate: input.isTemplate ?? false,
    dirPath: input.dirPath,
    skillMdPath: input.skillMdPath,
    tokensCssPath: input.tokensCssPath,
    readmeMdPath: input.readmeMdPath,
    thumbnailPath: input.thumbnailPath,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
  return await getDesignSystemDetail(input.id);
}

export async function updateDesignSystemRecord(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    status?: DesignSystemSummary["status"];
  },
): Promise<DesignSystemDetail | null> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.status !== undefined) set.status = patch.status;
  await db
    .update(designSystemsTable)
    .set(set)
    .where(eq(designSystemsTable.id, id));
  return await getDesignSystemDetail(id);
}

export async function deleteDesignSystemRecord(id: string): Promise<void> {
  const db = getDb();
  await db.delete(designSystemsTable).where(eq(designSystemsTable.id, id));
}

export async function listActiveProjectsForDesignSystem(
  designSystemId: string,
): Promise<Array<{ id: string; name: string }>> {
  const db = getDb();
  const rows = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.designSystemId, designSystemId),
        isNull(projectsTable.archivedAt),
      ),
    );
  return rows.map((row) => ({ id: row.id, name: row.name }));
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
    renderInitialArtifact({
      name: input.name,
      type: input.type,
      options: parseSlideDeckOptions(input.optionsJson),
    }),
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

function parseSlideDeckOptions(optionsJson: string | null): SlideDeckOptions {
  if (!optionsJson) return {};
  try {
    const parsed = JSON.parse(optionsJson);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        use_speaker_notes:
          typeof record.use_speaker_notes === "boolean"
            ? record.use_speaker_notes
            : undefined,
      };
    }
  } catch {
    // malformed options JSON — fall through to defaults
  }
  return {};
}
