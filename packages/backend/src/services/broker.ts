import type { NormalizedEvent } from "@bg/shared";

type Listener = (event: NormalizedEvent) => void;

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
    for (const listener of set) listener(event);
  }
}

export const broker = new EventBroker();
