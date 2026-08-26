import { ulid } from "ulid";
import { parseDesignDirectionState, type DesignDirectionState, type NormalizedEvent } from "@bg/shared";
import { insertNormalizedEvent, listSessionEvents } from "../db/events";
import { broker, sequencedBroker } from "./broker";

export async function getLatestDirectionState(sessionId: string): Promise<DesignDirectionState | null> {
  const events = await listSessionEvents(sessionId);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]?.event;
    if (event?.type === "design.direction_state") return parseDesignDirectionState(event.state);
  }
  return null;
}

export async function publishDirectionState(sessionId: string, state: DesignDirectionState): Promise<void> {
  const parsed = parseDesignDirectionState(state);
  const event: NormalizedEvent = { id: ulid(), ts: parsed.updated_at, type: "design.direction_state", state: parsed };
  const persisted = await insertNormalizedEvent(sessionId, event);
  broker.publish(sessionId, event);
  sequencedBroker.publish(sessionId, persisted);
}
