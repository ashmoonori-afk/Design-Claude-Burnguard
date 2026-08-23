import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const designSystemsTable = sqliteTable(
  "design_systems",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["draft", "review", "published"] }).notNull(),
    sourceType: text("source_type", { enum: ["sample", "github", "website", "figma", "upload", "manual"] }),
    sourceUri: text("source_uri"),
    isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
    dirPath: text("dir_path").notNull(),
    skillMdPath: text("skill_md_path"),
    tokensCssPath: text("tokens_css_path"),
    readmeMdPath: text("readme_md_path"),
    thumbnailPath: text("thumbnail_path"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    archivedAt: integer("archived_at"),
    metadataRevision: integer("metadata_revision").notNull().default(0),
  },
  (table) => [index("idx_ds_status").on(table.status)],
);

export const projectsTable = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type", { enum: ["prototype", "slide_deck", "from_template", "other"] }).notNull(),
    designSystemId: text("design_system_id").references(() => designSystemsTable.id),
    dirPath: text("dir_path").notNull(),
    entrypoint: text("entrypoint").notNull().default("index.html"),
    thumbnailPath: text("thumbnail_path"),
    backendId: text("backend_id", { enum: ["claude-code", "codex"] }).notNull(),
    optionsJson: text("options_json"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    currentRevision: integer("current_revision").notNull().default(0),
    currentDigest: text("current_digest"),
  },
  (table) => [
    index("idx_projects_updated").on(table.updatedAt),
    index("idx_projects_ds").on(table.designSystemId),
  ],
);

export const sessionsTable = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    backendId: text("backend_id", { enum: ["claude-code", "codex"] }).notNull(),
    backendSessionState: text("backend_session_state"),
    status: text("status", { enum: ["idle", "running", "awaiting_tool", "error", "terminated"] }).notNull().default("idle"),
    pid: integer("pid"),
    lastTurnId: text("last_turn_id"),
    usageInputTokens: integer("usage_input_tokens").notNull().default(0),
    usageOutputTokens: integer("usage_output_tokens").notNull().default(0),
    usageCacheRead: integer("usage_cache_read").notNull().default(0),
    usageCacheWrite: integer("usage_cache_write").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastActiveAt: integer("last_active_at").notNull(),
  },
  (table) => [
    index("idx_sessions_project").on(table.projectId),
    index("idx_sessions_status").on(table.status),
  ],
);

export const eventsTable = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["up", "down"] }).notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    turnId: text("turn_id"),
    processedAt: integer("processed_at").notNull(),
    createdAt: integer("created_at").notNull(),
    sequence: integer("sequence"),
  },
  (table) => [
    index("idx_events_session_time").on(table.sessionId, table.processedAt),
    index("idx_events_turn").on(table.turnId),
    index("idx_events_type").on(table.sessionId, table.type),
    uniqueIndex("uq_events_session_sequence").on(table.sessionId, table.sequence),
  ],
);

export const exportsTable = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    format: text("format", { enum: ["html_zip", "pdf", "pptx", "handoff"] }).notNull(),
    status: text("status", { enum: ["pending", "running", "succeeded", "failed"] }).notNull(),
    outputPath: text("output_path"),
    errorMessage: text("error_message"),
    sizeBytes: integer("size_bytes"),
    optionsJson: text("options_json"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("idx_exports_project").on(table.projectId, table.createdAt)],
);
