import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("You"),
  email: text("email"),
  createdAt: integer("created_at").notNull(),
});

export const designSystemsTable = sqliteTable(
  "design_systems",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["draft", "review", "published"] }).notNull(),
    sourceType: text("source_type", {
      enum: ["sample", "github", "figma", "upload", "manual"],
    }),
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
  },
  (table) => ({
    statusIdx: index("idx_ds_status").on(table.status),
  }),
);

export const projectsTable = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["prototype", "slide_deck", "from_template", "other"],
    }).notNull(),
    designSystemId: text("design_system_id").references(() => designSystemsTable.id),
    dirPath: text("dir_path").notNull(),
    entrypoint: text("entrypoint").notNull().default("index.html"),
    thumbnailPath: text("thumbnail_path"),
    backendId: text("backend_id", { enum: ["claude-code", "codex"] }).notNull(),
    optionsJson: text("options_json"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    updatedIdx: index("idx_projects_updated").on(table.updatedAt),
    dsIdx: index("idx_projects_ds").on(table.designSystemId),
  }),
);

export const sessionsTable = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    backendId: text("backend_id", { enum: ["claude-code", "codex"] }).notNull(),
    backendSessionState: text("backend_session_state"),
    status: text("status", {
      enum: ["idle", "running", "awaiting_tool", "error", "terminated"],
    })
      .notNull()
      .default("idle"),
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
  (table) => ({
    projectIdx: index("idx_sessions_project").on(table.projectId),
    statusIdx: index("idx_sessions_status").on(table.status),
  }),
);

export const eventsTable = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["up", "down"] }).notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    turnId: text("turn_id"),
    processedAt: integer("processed_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    sessionTimeIdx: index("idx_events_session_time").on(
      table.sessionId,
      table.processedAt,
    ),
    turnIdx: index("idx_events_turn").on(table.turnId),
    typeIdx: index("idx_events_type").on(table.sessionId, table.type),
  }),
);

export const attachmentsTable = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    turnId: text("turn_id"),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type").notNull(),
    originalName: text("original_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_attachments_session").on(table.sessionId),
  }),
);

export const filesTable = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    relPath: text("rel_path").notNull(),
    category: text("category", {
      enum: ["stylesheet", "script", "document", "asset", "folder", "html", "other"],
    }).notNull(),
    sizeBytes: integer("size_bytes"),
    hash: text("hash"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    relPathUnique: uniqueIndex("uq_files_project_rel_path").on(
      table.projectId,
      table.relPath,
    ),
    projectIdx: index("idx_files_project").on(table.projectId),
  }),
);

export const commentsTable = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    anchorFile: text("anchor_file").notNull(),
    anchorNodeId: text("anchor_node_id").notNull(),
    anchorRectJson: text("anchor_rect_json"),
    body: text("body").notNull(),
    authorId: text("author_id").notNull().default("local"),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    projectIdx: index("idx_comments_project").on(table.projectId, table.resolvedAt),
  }),
);

export const tweaksTable = sqliteTable(
  "tweaks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    nodeId: text("node_id").notNull(),
    prop: text("prop").notNull(),
    value: text("value").notNull(),
    turnId: text("turn_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    projectNodeIdx: index("idx_tweaks_project_node").on(table.projectId, table.nodeId),
    turnIdx: index("idx_tweaks_turn").on(table.turnId),
  }),
);

export const exportsTable = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    format: text("format", { enum: ["html_zip", "pdf", "pptx", "handoff"] }).notNull(),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed"],
    }).notNull(),
    outputPath: text("output_path"),
    errorMessage: text("error_message"),
    sizeBytes: integer("size_bytes"),
    optionsJson: text("options_json"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => ({
    projectIdx: index("idx_exports_project").on(table.projectId, table.createdAt),
  }),
);

export const metaSchemaTable = sqliteTable("meta_schema", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
