import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createLearningItem, selectPromptLearning } from "../src/db/learning-store";
import { ensureLearningSchema } from "./learning-fixture";

function checkpointContext(id: string): string {
  return JSON.stringify({
    kind: "iteration",
    parent_checkpoint_id: id,
    schema_revision: 1,
    artifact_revision: 7,
    artifact_digest: "digest-7",
  });
}

describe("learning checkpoint selection", () => {
  test("selects the lexically greatest ID when revision and creation time tie", () => {
    // Given
    const db = new Database(":memory:");
    ensureLearningSchema(db);
    db.prepare("INSERT INTO projects (id,name,type,dir_path,backend_id,current_revision,current_digest,created_at,updated_at) VALUES ('project','Project','prototype','/tmp/project','codex',7,'digest-7',1,1)").run();
    createLearningItem(db, { id: "item", kind: "lesson", title: "Item", summary: "Item", projectId: null }, 1);
    const insert = db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)");
    insert.run("checkpoint-a", "item", "project", 7, "digest-7", "a", checkpointContext("checkpoint-a"), 2);
    insert.run("checkpoint-z", "item", "project", 7, "digest-7", "z", checkpointContext("checkpoint-z"), 2);

    // When
    const selected = selectPromptLearning(db, "project");

    // Then
    expect(selected.context?.checkpoint_id).toBe("checkpoint-z");
    db.close();
  });
});
