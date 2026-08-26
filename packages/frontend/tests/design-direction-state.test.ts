import { describe, expect, test } from "bun:test";
import type {
  DesignDirectionSlot,
  DesignDirectionState,
  DesignDirectionStatus,
  NormalizedEvent,
} from "@bg/shared";
import {
  directionActions,
  directionProgress,
  latestDirectionState,
  preferDirectionState,
} from "../src/lib/design-direction-state";

function slot(
  id: "editorial" | "modular" | "narrative",
  order: number,
  status: DesignDirectionSlot["status"],
): DesignDirectionSlot {
  return {
    id,
    order,
    layout_key: id,
    title: id,
    summary: id,
    style_facts: [id],
    status,
    preview_url: status === "ready" ? `/preview/${id}` : null,
    error: status === "failed" || status === "cancelled" ? `${id} failed` : null,
  };
}

function state(
  overrides: Partial<DesignDirectionState> & {
    readonly status: DesignDirectionStatus;
    readonly updated_at: number;
  },
): DesignDirectionState {
  return {
    schema_version: 1,
    project_id: "p1",
    session_id: "s1",
    generation_id: "g1",
    content_outline: ["outline"],
    directions: [
      slot("editorial", 0, "pending"),
      slot("modular", 1, "pending"),
      slot("narrative", 2, "pending"),
    ],
    selected_id: null,
    selection_revision: 0,
    selection_history: [],
    error: null,
    ...overrides,
  };
}

const loading = state({ status: "loading", updated_at: 100 });
const partial = state({
  status: "partial",
  updated_at: 200,
  directions: [
    slot("editorial", 0, "ready"),
    slot("modular", 1, "failed"),
    slot("narrative", 2, "ready"),
  ],
});
const selected = state({
  ...partial,
  status: "partial",
  updated_at: 300,
  selected_id: "editorial",
  selection_revision: 1,
  selection_history: [null],
});

function directionEvent(id: string, value: DesignDirectionState): NormalizedEvent {
  return { id, ts: value.updated_at, type: "design.direction_state", state: value };
}

describe("latestDirectionState", () => {
  test("Given out-of-order direction events When deriving Then the newest snapshot wins", () => {
    const events: readonly NormalizedEvent[] = [
      directionEvent("e2", partial),
      directionEvent("e1", loading),
      directionEvent("e3", selected),
      { id: "e4", ts: 999, type: "status.running" },
    ];
    expect(latestDirectionState(events)).toBe(selected);
  });

  test("Given same-millisecond snapshots When deriving Then the higher selection revision wins", () => {
    const undone = state({ ...selected, updated_at: 300, selected_id: null, selection_revision: 2, selection_history: [] });
    expect(latestDirectionState([directionEvent("e2", undone), directionEvent("e1", selected)])).toBe(undone);
  });

  test("Given no direction events When deriving Then no state is produced", () => {
    expect(latestDirectionState([{ id: "e1", ts: 1, type: "status.running" }])).toBeNull();
    expect(latestDirectionState([])).toBeNull();
  });
});

describe("preferDirectionState", () => {
  test("Given a stale mutation response after a newer event When merging Then the newer event state is kept", () => {
    expect(preferDirectionState(partial, loading)).toBe(partial);
  });

  test("Given a newer mutation response When merging Then it replaces the cached state", () => {
    expect(preferDirectionState(partial, selected)).toBe(selected);
  });

  test("Given an empty cache When merging Then the incoming state is adopted", () => {
    expect(preferDirectionState(null, loading)).toBe(loading);
    expect(preferDirectionState(loading, null)).toBe(loading);
    expect(preferDirectionState(null, null)).toBeNull();
  });
});

describe("directionProgress", () => {
  test("Given a loading generation with one resolved slot When counted Then resolved and total are reported", () => {
    const running = state({
      status: "loading",
      updated_at: 150,
      directions: [slot("editorial", 0, "ready"), slot("modular", 1, "pending"), slot("narrative", 2, "pending")],
    });
    expect(directionProgress(running)).toEqual({ resolved: 1, total: 3 });
    expect(directionProgress(partial)).toEqual({ resolved: 3, total: 3 });
  });
});

describe("directionActions", () => {
  test("Given no direction state When resolving actions Then only generate is available", () => {
    expect(directionActions(null)).toEqual({
      canGenerate: true,
      canCancel: false,
      canRetry: false,
      canSelect: false,
      canUndo: false,
    });
  });

  test("Given a loading generation When resolving actions Then only cancel is available", () => {
    expect(directionActions(loading)).toEqual({
      canGenerate: false,
      canCancel: true,
      canRetry: false,
      canSelect: false,
      canUndo: false,
    });
  });

  test("Given a partial generation When resolving actions Then retry and selection are available without undo", () => {
    expect(directionActions(partial)).toEqual({
      canGenerate: true,
      canCancel: false,
      canRetry: true,
      canSelect: true,
      canUndo: false,
    });
  });

  test("Given a cancelled generation with a ready slot When resolving actions Then retry and selection stay available", () => {
    const cancelled = state({
      status: "cancelled",
      updated_at: 220,
      directions: [slot("editorial", 0, "ready"), slot("modular", 1, "cancelled"), slot("narrative", 2, "cancelled")],
    });
    expect(directionActions(cancelled).canRetry).toBe(true);
    expect(directionActions(cancelled).canSelect).toBe(true);
  });

  test("Given a selection with history When resolving actions Then undo is available", () => {
    expect(directionActions(selected).canUndo).toBe(true);
  });

  test("Given a fully ready generation When resolving actions Then retry is unavailable", () => {
    const ready = state({
      status: "ready",
      updated_at: 400,
      directions: [slot("editorial", 0, "ready"), slot("modular", 1, "ready"), slot("narrative", 2, "ready")],
    });
    expect(directionActions(ready).canRetry).toBe(false);
    expect(directionActions(ready).canSelect).toBe(true);
  });
});
