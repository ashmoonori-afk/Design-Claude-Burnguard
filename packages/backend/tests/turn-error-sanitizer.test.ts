import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getSqlite } from "../src/db/sqlite-client";
import { runMigrations } from "../src/db/migrate-local";
import { broker, sequencedBroker } from "../src/services/broker";
import { persistAndPublish } from "../src/services/turns";
import { PathBoundaryError } from "../src/security/path-boundary";

beforeAll(async () => {
  await runMigrations();
  const db = getSqlite();
  db.prepare("INSERT OR IGNORE INTO projects(id,name,type,dir_path,entrypoint,backend_id,created_at,updated_at) VALUES ('turn-error-project','P','prototype','/tmp/project','index.html','codex',1,1)").run();
  db.prepare("INSERT OR IGNORE INTO sessions(id,project_id,backend_id,status,created_at,updated_at,last_active_at) VALUES ('turn-error-session','turn-error-project','codex','idle',1,1,1)").run();
});

beforeEach(() => {
  getSqlite().prepare("DELETE FROM events WHERE session_id='turn-error-session'").run();
});

describe("turn error event boundary", () => {
  test("Given parent symlink PathBoundaryError When persisted and published Then DB SSE and replay contain only typed bounded Korean copy", async () => {
    const raw = "/private/Users/alice/project/.attachments/source.pdf escaped root";
    const observed: unknown[] = [];
    const sequenced: unknown[] = [];
    const unsubscribe = broker.subscribe("turn-error-session", (event) => { observed.push(event); });
    const unsubscribeSequenced = sequencedBroker.subscribe("turn-error-session", (event) => { sequenced.push(event); });
    try {
      await persistAndPublish("turn-error-session", { id: "path-error", ts: 2, type: "status.error", message: raw, recoverable: true }, new PathBoundaryError("outside_root", raw));
    } finally {
      unsubscribe();
      unsubscribeSequenced();
    }
    const row = getSqlite().query<{ readonly payload_json: string }, []>("SELECT payload_json FROM events WHERE id='path-error'").get();
    const combined = JSON.stringify({ row, observed, sequenced });
    expect(combined).not.toContain("/private/");
    expect(combined).not.toContain("source.pdf");
    expect(combined).toContain("path_unavailable");
    expect(combined).toContain("프로젝트 파일에 안전하게 접근할 수 없어요");
  });

  test("Given arbitrary POSIX Windows multiline and stack error When crossing boundary Then generic bounded copy replaces all diagnostics", async () => {
    const raw = "failed /private/a C:\\Users\\alice\\secret\nError: boom\n at internal (/srv/app.ts:4)";
    await persistAndPublish("turn-error-session", { id: "unknown-error", ts: 3, type: "status.error", message: raw, recoverable: true }, new Error(raw));
    const payload = getSqlite().query<{ readonly payload_json: string }, []>("SELECT payload_json FROM events WHERE id='unknown-error'").get()?.payload_json ?? "";
    expect(payload).not.toContain("/private/");
    expect(payload).not.toContain("C:\\\\Users");
    expect(payload).not.toContain("internal");
    expect(payload).toContain("turn_failed");
    expect(payload).toContain("요청을 처리하지 못했어요");
    expect(payload.length).toBeLessThan(300);
  });

  test("Given ordinary user cancellation When crossing boundary Then interrupted idle semantics remain unchanged", async () => {
    await persistAndPublish("turn-error-session", { id: "cancelled", ts: 4, type: "status.idle", stopReason: "interrupted" });
    expect(getSqlite().query<{ readonly payload_json: string }, []>("SELECT payload_json FROM events WHERE id='cancelled'").get()?.payload_json).toContain('"stopReason":"interrupted"');
    expect(getSqlite().query<{ readonly count: number }, []>("SELECT COUNT(*) count FROM events WHERE session_id='turn-error-session' AND type='status.error'").get()?.count).toBe(0);
  });

  test("Given an allowlisted immutable failure When crossing boundary Then its stable code and Korean copy survive", async () => {
    const error = Object.assign(new Error("raw /private/source.pdf"), { code: "immutable_reference_escaped" });
    await persistAndPublish("turn-error-session", { id: "known-error", ts: 4, type: "status.error", message: error.message, recoverable: true }, error);
    const payload = getSqlite().query<{ readonly payload_json: string }, []>("SELECT payload_json FROM events WHERE id='known-error'").get()?.payload_json ?? "";
    expect(payload).toContain("immutable_reference_escaped");
    expect(payload).toContain("읽기 전용 참조 파일은 결과물에 복사할 수 없어요");
    expect(payload).not.toContain("/private/");
  });
});
