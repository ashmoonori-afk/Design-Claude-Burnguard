import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { commitStoredCheckpoint, createLearningItem, LearningStoreError, selectPromptLearning } from "../src/db/learning-store";
import { ensureLearningSchema } from "./learning-fixture";

function setup() {
  const db = new Database(":memory:");
  ensureLearningSchema(db);
  db.prepare("INSERT INTO projects (id,name,type,dir_path,backend_id,current_revision,current_digest,created_at,updated_at) VALUES ('project','Project','prototype','/tmp/project','codex',7,'digest-7',1,1)").run();
  db.prepare("INSERT INTO projects (id,name,type,dir_path,backend_id,current_revision,current_digest,created_at,updated_at) VALUES ('other-project','Other','prototype','/tmp/other','codex',7,'digest-7',1,1)").run();
  createLearningItem(db, { id: "item", kind: "lesson", title: "Item", summary: "Item", projectId: null }, 1);
  createLearningItem(db, { id: "other-item", kind: "lesson", title: "Other", summary: "Other", projectId: null }, 1);
  return db;
}

function errorCode(action: () => void): string {
  try { action(); return "none"; }
  catch (error) { if (error instanceof LearningStoreError) return error.code; throw error; }
}

describe("learning checkpoint lineage", () => {
  test("Given a parent from another item or project When a child is committed Then each foreign lineage is rejected", () => {
    const db = setup();
    db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("other-item-parent", "other-item", "project", 7, "digest-7", "feedback", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "other-item-parent", schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }), 1);
    db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("other-project-parent", "item", "other-project", 7, "digest-7", "feedback", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "other-project-parent", schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }), 1);

    const codes = ["other-item-parent", "other-project-parent"].map((parentCheckpointId) => errorCode(() => commitStoredCheckpoint(db, {
      id: `child-${parentCheckpointId}`, itemId: "item", projectId: "project", artifactRevision: 7, artifactDigest: "digest-7", feedback: "child", parentCheckpointId,
      nextContext: { kind: "iteration", parent_checkpoint_id: `child-${parentCheckpointId}`, schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }, createdAt: 2,
    })));

    expect(codes).toEqual(["invalid_parent", "invalid_parent"]);
    db.close();
  });

  test("Given stale or malformed ancestors When a child is committed Then complete recursive compatibility is required", () => {
    const db = setup();
    db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("stale", "item", "project", 6, "stale", "feedback", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "stale", schema_revision: 1, artifact_revision: 6, artifact_digest: "stale" }), 1);
    db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("malformed", "item", "project", 7, "digest-7", "feedback", "{", 1);

    const codes = ["stale", "malformed"].map((parentCheckpointId) => errorCode(() => commitStoredCheckpoint(db, {
      id: `child-${parentCheckpointId}`, itemId: "item", projectId: "project", artifactRevision: 7, artifactDigest: "digest-7", feedback: "child", parentCheckpointId,
      nextContext: { kind: "iteration", parent_checkpoint_id: `child-${parentCheckpointId}`, schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }, createdAt: 2,
    })));

    expect(codes).toEqual(["invalid_parent", "invalid_parent"]);
    db.close();
  });

  test("Given a missing parent or cycle in stored SQL When selection runs Then typed warning replaces all suspect context", () => {
    for (const variant of ["missing", "cycle"] as const) {
      const db = setup();
      db.exec("PRAGMA foreign_keys = OFF");
      if (variant === "missing") {
        db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,parent_checkpoint_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .run("latest", "item", "project", "absent", 7, "digest-7", "feedback", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "latest", schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }), 2);
      } else {
        db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,parent_checkpoint_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .run("cycle-a", "item", "project", "cycle-b", 7, "digest-7", "a", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "cycle-a", schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }), 1);
        db.prepare("INSERT INTO learning_checkpoints (id,item_id,project_id,parent_checkpoint_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .run("cycle-b", "item", "project", "cycle-a", 7, "digest-7", "b", JSON.stringify({ kind: "iteration", parent_checkpoint_id: "cycle-b", schema_revision: 1, artifact_revision: 7, artifact_digest: "digest-7" }), 2);
      }
      db.exec("PRAGMA foreign_keys = ON");

      expect(selectPromptLearning(db, "project")).toEqual({ context: null, warning: "incompatible_checkpoint" });
      db.close();
    }
  });
});
