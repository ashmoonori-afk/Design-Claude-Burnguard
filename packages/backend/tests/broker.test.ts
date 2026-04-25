import { describe, expect, test } from "bun:test";
import type { NormalizedEvent } from "@bg/shared";
import { EventBroker } from "../src/services/broker";

function makeEvent(id: string, ts = Date.now()): NormalizedEvent {
  return { id, ts, type: "status.idle" } satisfies NormalizedEvent;
}

describe("EventBroker", () => {
  test("delivers events to all subscribers of a session", () => {
    const broker = new EventBroker();
    const a: NormalizedEvent[] = [];
    const b: NormalizedEvent[] = [];
    broker.subscribe("s1", (e) => a.push(e));
    broker.subscribe("s1", (e) => b.push(e));
    const ev = makeEvent("e1");
    broker.publish("s1", ev);
    expect(a).toEqual([ev]);
    expect(b).toEqual([ev]);
  });

  test("isolates a throwing listener so siblings still receive the event", () => {
    const broker = new EventBroker();
    const survived: NormalizedEvent[] = [];
    broker.subscribe("s1", () => {
      throw new Error("boom");
    });
    broker.subscribe("s1", (e) => survived.push(e));
    const ev = makeEvent("e1");
    // Must not throw — the bad listener's failure is logged, not bubbled.
    expect(() => broker.publish("s1", ev)).not.toThrow();
    expect(survived).toEqual([ev]);
  });

  test("survives an async listener that rejects", async () => {
    const broker = new EventBroker();
    const survived: NormalizedEvent[] = [];
    broker.subscribe("s1", async () => {
      throw new Error("async boom");
    });
    broker.subscribe("s1", (e) => survived.push(e));
    const ev = makeEvent("e1");
    expect(() => broker.publish("s1", ev)).not.toThrow();
    expect(survived).toEqual([ev]);
    // Wait a microtask so the async listener's rejection has resolved
    // through the broker's catch handler.
    await new Promise((r) => setTimeout(r, 0));
  });

  test("snapshots the listener set so unsubscribe-during-publish does not skip siblings", () => {
    const broker = new EventBroker();
    const order: string[] = [];
    const unsubA = broker.subscribe("s1", () => {
      order.push("A");
      // Unsubscribe self mid-iteration. Without the snapshot the for-of
      // loop would skip the next listener because the underlying Set
      // mutates during iteration (V8 behavior is well-defined: skip
      // removed entry, keep going on remaining — but that means the
      // ordering invariant is fragile across runtimes).
      unsubA();
    });
    broker.subscribe("s1", () => {
      order.push("B");
    });
    broker.publish("s1", makeEvent("e1"));
    expect(order).toEqual(["A", "B"]);
  });

  test("unsubscribe stops further deliveries and cleans the empty set", () => {
    const broker = new EventBroker();
    const seen: NormalizedEvent[] = [];
    const unsubscribe = broker.subscribe("s1", (e) => seen.push(e));
    broker.publish("s1", makeEvent("e1"));
    unsubscribe();
    broker.publish("s1", makeEvent("e2"));
    expect(seen.map((e) => e.id)).toEqual(["e1"]);
  });

  test("publishes to unrelated sessions do not cross over", () => {
    const broker = new EventBroker();
    const onS1: NormalizedEvent[] = [];
    const onS2: NormalizedEvent[] = [];
    broker.subscribe("s1", (e) => onS1.push(e));
    broker.subscribe("s2", (e) => onS2.push(e));
    broker.publish("s1", makeEvent("e1"));
    expect(onS1.length).toBe(1);
    expect(onS2.length).toBe(0);
  });
});
