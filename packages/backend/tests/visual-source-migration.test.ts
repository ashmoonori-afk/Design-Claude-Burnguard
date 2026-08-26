import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { runMigrationsFrom } from "../src/db/migrate";

const roots: string[] = [];
const databases: Database[] = [];

async function migrationsThrough(last: string): Promise<string> {
  const target = await mkdtemp(path.join(tmpdir(), "burnguard-visual-source-migration-"));
  roots.push(target);
  const source = path.join(import.meta.dir, "../src/db/migrations");
  for (const name of (await readdir(source)).filter((entry) => entry <= last)) {
    await cp(path.join(source, name), path.join(target, name));
  }
  return target;
}

afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("visual source role migration", () => {
  test("Given a legacy attachment When visual-source migrations run Then ordinary inferred role is durably backfilled and constrained", async () => {
    const db = new Database(":memory:");
    databases.push(db);
    const before = await migrationsThrough("0011_graphic_project_type.sql");
    await runMigrationsFrom(db, before);
    db.exec("INSERT INTO projects(id,name,type,dir_path,backend_id,created_at,updated_at) VALUES ('p','P','prototype','/tmp/p','codex',1,1); INSERT INTO sessions(id,project_id,backend_id,status,created_at,updated_at,last_active_at) VALUES ('s','p','codex','idle',1,1,1); INSERT INTO attachments(id,session_id,file_path,mime_type,original_name,size_bytes,sha256,created_at) VALUES ('a','s','/tmp/p/.attachments/a.pdf','application/pdf','a.pdf',1,NULL,1)");
    const after = await migrationsThrough("0013_visual_source_role_origin.sql");

    await runMigrationsFrom(db, after);

    expect(db.query("SELECT source_role,source_role_explicit FROM attachments WHERE id='a'").get()).toEqual({ source_role: "ordinary_content", source_role_explicit: 0 });
    expect(() => db.exec("UPDATE attachments SET source_role='url' WHERE id='a'")).toThrow();
    expect(db.query("SELECT name,\"notnull\" required,dflt_value defaultValue FROM pragma_table_info('attachments') WHERE name='source_role'").get()).toEqual({ name: "source_role", required: 1, defaultValue: "'ordinary_content'" });
  });
});
