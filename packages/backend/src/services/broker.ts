import type { NormalizedEvent } from "@bg/shared";

type Listener = (event: NormalizedEvent) => void | Promise<void>;

export class EventBroker {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(sessionId: string, listener: Listener) {
    const set = this.listeners.get(sessionId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(sessionId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  publish(sessionId: string, event: NormalizedEvent) {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    // Snapshot the listener set so a delete during iteration (e.g. an
    // SSE handler unsubscribing on error) cannot mutate the set we're
    // walking. Each listener is wrapped in a try/catch + async catch
    // so one failing subscriber can't shut down delivery to the rest.
    for (const listener of [...set]) {
      try {
        const result = listener(event);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[broker] async listener for session ${sessionId} threw:`,
              err,
            );
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[broker] sync listener for session ${sessionId} threw:`,
          err,
        );
      }
    }
  }
}

export const broker = new EventBroker();
