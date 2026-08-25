import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { runMigrationsFrom } from "../src/db/migrate";
import { researchRunsTable, researchSourcesTable } from "../src/db/research-schema";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
const normalized = (value: string) => value.toLowerCase().replaceAll('"', "").replaceAll("`", "").replace(/research_(runs|sources)\./g, "").replace(/\s+/g, " ");

describe("research migration", () => {
  test("Given all migrations When applied Then research tables, checks, indexes, and Drizzle metadata agree", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "burnguard-research-migrations-"));
    directories.push(directory);
    const source = path.join(import.meta.dir, "../src/db/migrations");
    for (const file of await readdir(source)) if (file.endsWith(".sql")) await cp(path.join(source, file), path.join(directory, file));
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    await runMigrationsFrom(db, directory);

    expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'research_%' ORDER BY name").all()).toEqual([
      { name: "research_runs" }, { name: "research_sources" },
    ]);
    const indexes = db.query<{ readonly name: string }, []>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%research_%' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all().map((row) => row.name);
    expect(indexes).toEqual(["idx_research_runs_prompt", "idx_research_sources_claim", "uq_research_sources_canonical"]);
    const runConfig = getTableConfig(researchRunsTable);
    const sourceConfig = getTableConfig(researchSourcesTable);
    expect(runConfig.indexes.map((item) => item.config.name).sort()).toEqual(["idx_research_runs_prompt"]);
    expect(sourceConfig.indexes.map((item) => item.config.name).sort()).toEqual(["idx_research_sources_claim", "uq_research_sources_canonical"]);
    const dialect = new SQLiteSyncDialect();
    const drizzleChecks = normalized([...runConfig.checks, ...sourceConfig.checks].map((item) => dialect.sqlToQuery(item.value).sql).join(" "));
    const tableChecks = normalized(db.query<{ readonly sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('research_runs','research_sources') ORDER BY name").all().map((row) => row.sql).join(" "));
    for (const check of ["mode='fixture') = (fixture_id is not null", "status in ('completed','partial')) = (usable=1", "status='duplicate') = (duplicate_of_source_id is not null", "status!='succeeded' or (content_digest is not null"]) {
      expect(drizzleChecks).toContain(check);
      expect(tableChecks).toContain(check);
    }

    db.exec(`INSERT INTO research_runs(id,request_key,status,mode,fixture_id,request_json,request_digest,orchestrator_digest,created_at,updated_at) VALUES ('run','key','pending','fixture','fixture-v1','{}','${"a".repeat(64)}','${"b".repeat(64)}',1,1)`);
    expect(() => db.exec("UPDATE research_runs SET usable=1 WHERE id='run'")).toThrow();
    expect(() => db.exec("INSERT INTO research_sources(id,run_id,ordinal,kind,locator,canonical_locator,dedup_key,status,created_at,updated_at) VALUES ('source','run',0,'fixture','x','x','key','succeeded',1,1)")).toThrow();
    db.close();
  });
});
