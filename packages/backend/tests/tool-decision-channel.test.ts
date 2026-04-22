import { describe, expect, test } from "bun:test";
import type {
  AdapterRunInput,
  DecisionHandler,
  ToolDecisionPayload,
} from "../src/adapters/types";

/**
 * These tests exercise the minimum contract of the decision channel
 * wired through `AdapterRunInput.onDecision`. The concrete
 * submit/queue logic lives in `services/turns.ts` but spinning up a
 * real turn requires a full DB + spawn harness, so the fast-path unit
 * coverage is done against a miniature reimplementation that mirrors
 * the same invariants — drain-on-register, reregister unsubscribe,
 * error-safe retry.
 *
 * When the turns.ts internals are refactored into a separately-
 * exported helper (so a real active-turn can be constructed without
 * the DB), these tests should migrate onto it directly.
 */

interface MiniActiveTurn {
  decisionQueue: ToolDecisionPayload[];
  decisionHandler: DecisionHandler | null;
}

function submit(
  turn: MiniActiveTurn,
  decision: ToolDecisionPayload,
): "delivered" | "queued" {
  if (turn.decisionHandler) {
    try {
      turn.decisionHandler(decision);
      return "delivered";
    } catch {
      turn.decisionQueue.push(decision);
      return "queued";
    }
  }
  turn.decisionQueue.push(decision);
  return "queued";
}

function buildOnDecision(turn: MiniActiveTurn): AdapterRunInput["onDecision"] {
  return (handler) => {
    turn.decisionHandler = handler;
    const queued = turn.decisionQueue.splice(0);
    for (const d of queued) {
      try {
        handler(d);
      } catch {
        turn.decisionQueue.push(d);
      }
    }
    return () => {
      if (turn.decisionHandler === handler) {
        turn.decisionHandler = null;
      }
    };
  };
}

function mkDecision(id: string, decision: "allow" | "deny"): ToolDecisionPayload {
  return { type: "user.tool_decision", toolCallId: id, decision };
}

describe("tool-decision channel contract", () => {
  test("decisions submitted before onDecision registers are queued, then drained in order", () => {
    const turn: MiniActiveTurn = { decisionQueue: [], decisionHandler: null };
    expect(submit(turn, mkDecision("a", "allow"))).toBe("queued");
    expect(submit(turn, mkDecision("b", "deny"))).toBe("queued");

    const seen: string[] = [];
    const onDecision = buildOnDecision(turn)!;
    onDecision((d) => seen.push(d.toolCallId));

    expect(seen).toEqual(["a", "b"]);
    expect(turn.decisionQueue).toEqual([]);
  });

  test("decisions submitted after register go straight through", () => {
    const turn: MiniActiveTurn = { decisionQueue: [], decisionHandler: null };
    const seen: string[] = [];
    const onDecision = buildOnDecision(turn)!;
    onDecision((d) => seen.push(d.toolCallId));

    expect(submit(turn, mkDecision("c", "allow"))).toBe("delivered");
    expect(seen).toEqual(["c"]);
    expect(turn.decisionQueue).toEqual([]);
  });

  test("unsubscribe clears the handler so the next submit queues again", () => {
    const turn: MiniActiveTurn = { decisionQueue: [], decisionHandler: null };
    const seen: string[] = [];
    const onDecision = buildOnDecision(turn)!;
    const unsubscribe = onDecision((d) => seen.push(d.toolCallId));
    unsubscribe();

    expect(submit(turn, mkDecision("d", "deny"))).toBe("queued");
    expect(seen).toEqual([]);
    expect(turn.decisionQueue).toEqual([mkDecision("d", "deny")]);
  });

  test("throwing handler requeues the decision for the next registrant", () => {
    const turn: MiniActiveTurn = { decisionQueue: [], decisionHandler: null };
    const onDecision = buildOnDecision(turn)!;
    onDecision(() => {
      throw new Error("oops");
    });

    expect(submit(turn, mkDecision("e", "allow"))).toBe("queued");
    expect(turn.decisionQueue).toEqual([mkDecision("e", "allow")]);

    // Replace the bad handler — the queued decision drains into it.
    turn.decisionHandler = null;
    const seen: string[] = [];
    onDecision((d) => seen.push(d.toolCallId));
    expect(seen).toEqual(["e"]);
  });
});
