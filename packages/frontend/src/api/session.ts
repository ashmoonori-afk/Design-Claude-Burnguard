import type { BackendId, NormalizedEvent, SessionInfo, UserEvent } from "@bg/shared";
import { apiFetch } from "./client";

export async function getSession(id: string): Promise<SessionInfo> {
  return apiFetch<SessionInfo>(`/api/sessions/${id}`);
}

export async function listSessionEvents(
  id: string,
  since?: number,
): Promise<NormalizedEvent[]> {
  const q = since != null ? `?since=${since}` : "";
  return apiFetch<NormalizedEvent[]>(`/api/sessions/${id}/events${q}`);
}

export async function sendUserEvent(
  id: string,
  event: UserEvent & { files?: File[] },
): Promise<void> {
  if (event.type === "user.message" && (event.files?.length ?? 0) > 0) {
    const form = new FormData();
    form.set("type", "user.message");
    form.set("text", event.text);
    for (const file of event.files ?? []) {
      form.append("files", file);
    }

    const res = await fetch(`/api/sessions/${id}/events`, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    if (!res.ok) {
      throw new Error(
        await res.text().catch(() => `Failed to send message to session ${id}`),
      );
    }
    return;
  }

  if (event.type === "user.message") {
    await apiFetch<{ accepted: true }>(`/api/sessions/${id}/events`, {
      method: "POST",
      body: JSON.stringify({
        type: "user.message",
        text: event.text,
        attachments: event.attachments,
      }),
    });
    return;
  }

  await apiFetch<{ accepted: true }>(`/api/sessions/${id}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export async function interruptSession(id: string): Promise<void> {
  await apiFetch<{ accepted: true }>(`/api/sessions/${id}/interrupt`, {
    method: "POST",
  });
}

export async function switchSessionBackend(
  sessionId: string,
  backendId: BackendId,
): Promise<SessionInfo> {
  return apiFetch<SessionInfo>(`/api/sessions/${sessionId}/backend`, {
    method: "PATCH",
    body: JSON.stringify({ backend_id: backendId }),
  });
}

export async function submitToolDecision(
  sessionId: string,
  input: { toolCallId: string; decision: "allow" | "deny"; reason?: string },
): Promise<void> {
  await apiFetch<{ accepted: true; decision: "allow" | "deny" }>(
    `/api/sessions/${sessionId}/tool-decision`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function subscribeSessionStream(
  id: string,
  onEvent: (event: NormalizedEvent) => void,
): () => void {
  const source = new EventSource(`/api/sessions/${id}/stream`);
  const listener = (message: MessageEvent<string>) => {
    onEvent(JSON.parse(message.data) as NormalizedEvent);
  };
  source.addEventListener("message", listener as EventListener);
  return () => source.close();
}
