import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTableName, SQL, sql } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { runMigrationsFrom } from "../src/db/migrate";
import { designSystemsTable, eventsTable, exportsTable, projectsTable, sessionsTable } from "../src/db/pipeline-authorities";
import { artifactOperationsTable, designSystemReceiptsTable, designSystemTagsTable, exportAttemptsTable, learningCheckpointsTable, learningItemsTable, learningProgressTable } from "../src/db/pipeline-schema";

const sourceDir = path.join(import.meta.dir, "../src/db/migrations");
const databases: Database[] = [];
const directories: string[] = [];

function database(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  databases.push(db);
  return db;
}

async function migrationDirectory(last: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "burnguard-migrations-"));
  directories.push(directory);
  for (const file of (await readdir(sourceDir)).filter((name) => name <= last)) {
    await cp(path.join(sourceDir, file), path.join(directory, file));
  }
  return directory;
}

afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

type ExpectedParity = {
  readonly table: SQLiteTable;
  readonly checks: readonly string[];
  readonly defaults: Readonly<Record<string, string>>;
  readonly namedIndexes: readonly string[];
  readonly primaryKey: readonly string[];
  readonly unique: readonly (readonly string[])[];
};

const parityTables: readonly ExpectedParity[] = [
  { table: designSystemTagsTable, checks: [], defaults: {}, namedIndexes: [], primaryKey: ["design_system_id", "tag"], unique: [["design_system_id", "ordinal"]] },
  { table: designSystemReceiptsTable, checks: ["status in ('prepared','committed','recovering','failed')", "operation in ('content','duplicate','derive','trash','restore','purge')"], defaults: { status: "prepared", operation: "content", metadata_json: "{}" }, namedIndexes: ["idx_design_system_receipt_operation", "idx_design_system_receipts_system", "uq_design_system_nonterminal_receipt"], primaryKey: ["id"], unique: [["design_system_id", "content_revision"]] },
  { table: learningItemsTable, checks: ["kind in ('lesson','example','skill-card')"], defaults: {}, namedIndexes: ["idx_learning_items_kind"], primaryKey: ["id"], unique: [] },
  { table: learningProgressTable, checks: ["state in ('not_started','in_progress','completed')"], defaults: { state: "not_started", revision: "0" }, namedIndexes: [], primaryKey: ["item_id"], unique: [] },
  { table: learningCheckpointsTable, checks: [], defaults: {}, namedIndexes: ["idx_learning_checkpoints_item"], primaryKey: ["id"], unique: [] },
  { table: artifactOperationsTable, checks: ["status in ('pending','working','committed','cancelled','failed','conflicted','recovering','recovered')"], defaults: { status: "pending" }, namedIndexes: ["idx_artifact_operations_project", "uq_artifact_operations_nonterminal"], primaryKey: ["id"], unique: [] },
  { table: exportAttemptsTable, checks: ["status in ('pending','running','validating','validated','failed','cancelled','retrying','recovering','expired','corrupt')"], defaults: {}, namedIndexes: ["idx_export_attempts_job"], primaryKey: ["id"], unique: [] },
];

const dialect = new SQLiteSyncDialect();
function normalized(value: string): string {
  return value.toLowerCase().replaceAll('"', "").replaceAll("`", "").replace(/\s+/g, " ").trim();
}
function indexExpression(value: SQL | { readonly name: string }): string {
  return normalized(dialect.sqlToQuery(value instanceof SQL ? value : sql`${value}`, "indexes").sql);
}
function sqliteIndexColumns(db: Database, indexName: string): readonly string[] {
  return db.query<{ readonly name: string; readonly descending: number }, [string]>("SELECT name,\"desc\" AS descending FROM pragma_index_xinfo(?) WHERE key=1 ORDER BY seqno").all(indexName).map((row) => `${row.name}${row.descending === 1 ? " desc" : ""}`);
}
function namedIndexes(db: Database, tableName: string) {
  return db.query<{ readonly name: string; readonly uniqueValue: number; readonly partial: number }, [string]>("SELECT name,\"unique\" AS uniqueValue,partial FROM pragma_index_list(?) WHERE origin='c' ORDER BY name").all(tableName).map((item) => ({ name: item.name, unique: item.uniqueValue === 1, partial: item.partial === 1, columns: sqliteIndexColumns(db, item.name) }));
}

 describe("pipeline migration", () => {
  test("Given legacy missing paths When 0005 runs Then rows survive with deterministic backfills and no receipt inference", async () => {
    // Given
    const db = database();
    const directory = await migrationDirectory("0004_design_systems_website_source_type.sql");
    await runMigrationsFrom(db, directory);
    db.exec(`
      INSERT INTO design_systems (id,name,status,dir_path,created_at,updated_at) VALUES ('ds','Legacy','draft','/missing/system',1,1);
      INSERT INTO projects (id,name,type,dir_path,backend_id,created_at,updated_at) VALUES ('p','Legacy','prototype','/missing/project','codex',1,1);
      INSERT INTO sessions (id,project_id,backend_id,status,created_at,updated_at,last_active_at) VALUES ('s','p','codex','idle',1,1,1);
      INSERT INTO events (id,session_id,direction,type,payload_json,processed_at,created_at) VALUES
        ('event-b','s','down','x','{}',10,10), ('event-a','s','down','x','{}',10,10), ('event-c','s','down','x','{}',11,11);
    `);
    await cp(path.join(sourceDir, "0005_pipeline_durability.sql"), path.join(directory, "0005_pipeline_durability.sql"));

    // When
    await runMigrationsFrom(db, directory);
    await runMigrationsFrom(db, directory);

    // Then
    expect(db.query("SELECT metadata_revision FROM design_systems WHERE id='ds'").get()).toEqual({ metadata_revision: 0 });
    expect(db.query("SELECT current_revision,current_digest FROM projects WHERE id='p'").get()).toEqual({ current_revision: 0, current_digest: null });
    expect(db.query("SELECT id,sequence FROM events ORDER BY sequence").all()).toEqual([
      { id: "event-a", sequence: 1 }, { id: "event-b", sequence: 2 }, { id: "event-c", sequence: 3 },
    ]);
    expect(db.query("SELECT COUNT(*) AS count FROM design_system_receipts").get()).toEqual({ count: 0 });
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE id='0005_pipeline_durability.sql'").get()).toEqual({ count: 1 });

    // Given an installation that already recorded 0005
    await cp(path.join(sourceDir, "0006_catalog.sql"), path.join(directory, "0006_catalog.sql"));

    // When the catalog migration is applied
    await runMigrationsFrom(db, directory);

    // Then the legacy row gains catalog defaults without content receipt inference
    expect(db.query("SELECT catalog_kind,catalog_owner,lifecycle,provenance_state,license_state FROM design_systems WHERE id='ds'").get()).toEqual({ catalog_kind: "design-system", catalog_owner: "local", lifecycle: "active", provenance_state: "unknown", license_state: "unknown" });
    expect(db.query("SELECT COUNT(*) AS count FROM design_system_receipts").get()).toEqual({ count: 0 });
    expect(db.query("SELECT id FROM schema_migrations WHERE id IN ('0005_pipeline_durability.sql','0006_catalog.sql') ORDER BY id").all()).toEqual([{ id: "0005_pipeline_durability.sql" }, { id: "0006_catalog.sql" }]);
  });

  test("Given the full migration When schema is inspected Then exactly three learning tables and one-nonterminal index exist", async () => {
    // Given
    const db = database();
    const directory = await migrationDirectory("9999");

    // When
    await runMigrationsFrom(db, directory);

    // Then
    expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'learning_%' ORDER BY name").all()).toEqual([
      { name: "learning_checkpoints" }, { name: "learning_items" }, { name: "learning_progress" },
    ]);
    expect(db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_artifact_operations_nonterminal'").get()).toEqual({ name: "uq_artifact_operations_nonterminal" });
    expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });

  test("Given 0005 and Drizzle metadata When every machine constraint is compared Then both schema surfaces are identical", async () => {
    // Given
    const db = database();
    await runMigrationsFrom(db, await migrationDirectory("9999"));
    const authorityConfigs = [designSystemsTable, projectsTable, sessionsTable, eventsTable, exportsTable].map(getTableConfig);
    for (const config of authorityConfigs) {
      for (const foreignKey of config.foreignKeys) foreignKey.reference();
    }

    // When / Then
    expect(authorityConfigs.flatMap((config) => config.indexes).map((index) => index.config.name).sort()).toEqual(["idx_design_system_catalog", "idx_ds_status", "idx_events_session_time", "idx_events_turn", "idx_events_type", "idx_exports_project", "idx_projects_ds", "idx_projects_updated", "idx_sessions_project", "idx_sessions_status", "uq_events_session_sequence"]);
    for (const authority of [
      { table: designSystemsTable, alteredColumns: ["metadata_revision", "catalog_kind", "catalog_owner", "lifecycle", "provenance_state", "license_state", "trashed_at"] },
      { table: projectsTable, alteredColumns: ["current_revision", "current_digest"] },
      { table: eventsTable, alteredColumns: ["sequence"] },
    ]) {
      const name = getTableName(authority.table);
      const config = getTableConfig(authority.table);
      const sqliteColumns = db.query<{ readonly name: string; readonly type: string; readonly required: number; readonly defaultValue: string | null }, [string]>("SELECT name,type,\"notnull\" AS required,dflt_value AS defaultValue FROM pragma_table_info(?) ORDER BY cid").all(name).filter((column) => authority.alteredColumns.includes(column.name)).map((column) => ({ ...column, defaultValue: column.defaultValue?.replaceAll("'", "") ?? null }));
      const drizzleColumns = config.columns.filter((column) => authority.alteredColumns.includes(column.name)).map((column) => ({ name: column.name, type: column.getSQLType().toUpperCase(), required: column.notNull ? 1 : 0, defaultValue: column.default === undefined ? null : String(column.default) }));
      const drizzleIndexes = config.indexes.map((index) => ({ name: index.config.name, unique: index.config.unique, partial: index.config.where !== undefined, columns: index.config.columns.map(indexExpression) })).sort((left, right) => left.name.localeCompare(right.name));
      expect(drizzleColumns).toEqual(sqliteColumns);
      if (name === "events" || name === "design_systems") expect(drizzleIndexes).toEqual(namedIndexes(db, name));
    }
    const designSystemChecks = normalized(getTableConfig(designSystemsTable).checks.map((item) => dialect.sqlToQuery(item.value).sql).join(" "));
    const designSystemTableSql = normalized(db.query<{ readonly sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='design_systems'").get()?.sql ?? "");
    for (const fragment of [
      "catalog_kind in ('design-system','pattern-library','template')",
      "catalog_owner = 'local'",
      "lifecycle in ('active','archived','trashed')",
      "provenance_state in ('observed','inferred','defaulted','unknown','conflicted')",
      "license_state in ('verified','declared','unknown','restricted')",
    ]) {
      expect(designSystemChecks).toContain(fragment);
      expect(designSystemTableSql).toContain(`check(${fragment})`);
    }
    for (const expected of parityTables) {
      const name = getTableName(expected.table);
      const config = getTableConfig(expected.table);
      const tableSql = normalized(db.query<{ readonly sql: string }, [string]>("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql ?? "");
      const sqliteColumns = db.query<{ readonly name: string; readonly type: string; readonly required: number; readonly defaultValue: string | null; readonly pk: number }, [string]>("SELECT name,type,\"notnull\" AS required,dflt_value AS defaultValue,pk FROM pragma_table_info(?) ORDER BY cid").all(name);
      const drizzleColumnParity = config.columns.map((column) => ({ name: column.name, type: column.getSQLType().toUpperCase(), required: column.notNull ? 1 : 0 }));
      const sqliteColumnParity = sqliteColumns.map((column) => ({ name: column.name, type: column.type, required: column.required }));
      const sqliteForeignKeys = db.query<{ readonly source: string; readonly targetTable: string; readonly target: string; readonly onDelete: string }, [string]>("SELECT \"from\" AS source,\"table\" AS targetTable,\"to\" AS target,on_delete AS onDelete FROM pragma_foreign_key_list(?) ORDER BY id DESC").all(name);
      const drizzleForeignKeys = config.foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return { source: reference.columns[0]?.name, targetTable: getTableName(reference.foreignTable), target: reference.foreignColumns[0]?.name, onDelete: (foreignKey.onDelete ?? "no action").toUpperCase() };
      });
      const sqliteNamedIndexes = namedIndexes(db, name);
      const drizzleIndexes = config.indexes.map((index) => ({ name: index.config.name, unique: index.config.unique, partial: index.config.where !== undefined, columns: index.config.columns.map(indexExpression) })).sort((left, right) => left.name.localeCompare(right.name));
      const drizzlePrimary = [...config.columns.filter((column) => column.primary).map((column) => column.name), ...config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name))];
      const sqlitePrimary = sqliteColumns.filter((column) => column.pk > 0).sort((left, right) => left.pk - right.pk).map((column) => column.name);
      const sqliteUnique = db.query<{ readonly name: string }, [string]>("SELECT name FROM pragma_index_list(?) WHERE origin='u' ORDER BY name").all(name).map((index) => sqliteIndexColumns(db, index.name)).sort();
      const drizzleUnique = config.uniqueConstraints.map((constraint) => constraint.columns.map((column) => column.name)).sort();
      const drizzleDefaults = Object.fromEntries(config.columns.filter((column) => column.default !== undefined).map((column) => [column.name, String(column.default)]));
      const sqliteDefaults = Object.fromEntries(sqliteColumns.filter((column) => column.defaultValue !== null).map((column) => [column.name, column.defaultValue?.replaceAll("'", "")]));
      const drizzleChecks = normalized(config.checks.map((check) => dialect.sqlToQuery(check.value).sql).join(" "));

      expect(drizzleColumnParity).toEqual(sqliteColumnParity);
      expect(drizzleForeignKeys).toEqual(sqliteForeignKeys);
      expect(drizzleIndexes).toEqual(sqliteNamedIndexes);
      expect(drizzlePrimary).toEqual(sqlitePrimary);
      expect(drizzleUnique).toEqual(sqliteUnique);
      expect(drizzleDefaults).toEqual(sqliteDefaults);
      expect(config.indexes.map((index) => index.config.name).sort()).toEqual([...expected.namedIndexes].sort());
      expect(sqlitePrimary).toEqual(expected.primaryKey);
      expect(sqliteUnique).toEqual([...expected.unique].sort());
      for (const checkFragment of expected.checks) {
        expect(drizzleChecks).toContain(checkFragment);
        expect(tableSql).toContain(`check(${checkFragment})`);
      }
    }
    const requiredPrimaryKeys = [
      ["design_system_receipts", "id"], ["learning_items", "id"], ["learning_progress", "item_id"],
      ["learning_checkpoints", "id"], ["artifact_operations", "id"], ["export_attempts", "id"],
    ];
    const drizzlePrimaryRequired = requiredPrimaryKeys.map(([tableName, columnName]) => {
      const table = parityTables.find((item) => getTableName(item.table) === tableName)?.table;
      return table === undefined ? 0 : getTableConfig(table).columns.find((column) => column.name === columnName)?.notNull ? 1 : 0;
    });
    expect(drizzlePrimaryRequired).toEqual([1, 1, 1, 1, 1, 1]);
    expect(requiredPrimaryKeys.map(([tableName, columnName]) => db.query<{ readonly required: number }, [string, string]>("SELECT \"notnull\" AS required FROM pragma_table_info(?) WHERE name=?").get(tableName, columnName)?.required)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(normalized(db.query<{ readonly sql: string }, []>("SELECT sql FROM sqlite_master WHERE name='uq_artifact_operations_nonterminal'").get()?.sql ?? "")).toContain("where status in ('pending','working','recovering')");
    expect(db.query("SELECT name FROM sqlite_master WHERE type='trigger' AND name='immutable_learning_checkpoints'").get()).toEqual({ name: "immutable_learning_checkpoints" });
  });

  test("Given a broken later migration When migration fails Then its transaction rolls back and foreign keys recover", async () => {
    // Given
    const db = database();
    const directory = await migrationDirectory("9999");
    await Bun.write(path.join(directory, "0006_broken.sql"), "CREATE TABLE should_rollback(id TEXT); INSERT INTO absent VALUES (1);");

    // When
    const failure = runMigrationsFrom(db, directory);

    // Then
    await expect(failure).rejects.toBeDefined();
    expect(db.query("SELECT name FROM sqlite_master WHERE name='should_rollback'").get()).toBeNull();
    expect(db.query("SELECT id FROM schema_migrations WHERE id='0005_pipeline_durability.sql'").get()).toEqual({ id: "0005_pipeline_durability.sql" });
    expect(db.query("SELECT id FROM schema_migrations WHERE id='0006_broken.sql'").get()).toBeNull();
    expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });
});
