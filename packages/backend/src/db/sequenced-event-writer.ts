import type { Database } from "bun:sqlite";

export type SequencedEventInput = {
  readonly id: string;
  readonly sessionId: string;
  readonly direction: "up" | "down";
  readonly type: string;
  readonly payload: unknown;
  readonly turnId: string | null;
  readonly processedAt: number;
  readonly createdAt: number;
};

export function insertSequencedEvent(db: Database, input: SequencedEventInput): { readonly id: string; readonly sequence: number } {
  return db.transaction(() => {
    const row = db.query<{ readonly next: number }, [string]>("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM events WHERE session_id = ?").get(input.sessionId);
    const sequence = row?.next ?? 1;
    db.prepare("INSERT INTO events (id,session_id,direction,type,payload_json,turn_id,processed_at,created_at,sequence) VALUES (?,?,?,?,?,?,?,?,?)").run(input.id, input.sessionId, input.direction, input.type, JSON.stringify(input.payload), input.turnId, input.processedAt, input.createdAt, sequence);
    return { id: input.id, sequence };
  })();
}
