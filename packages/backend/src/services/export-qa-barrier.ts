import type { ExportHooks, ExportPhase } from "./exports";

const TIMEOUT_MS = 300_000;
type Behavior = "pause" | "fail";
export type ExportQaPhase = ExportPhase | "gc_after_tombstone_before_unlink" | "gc_after_unlink";
type Barrier = {
  readonly token: string;
  readonly phase: ExportQaPhase;
  readonly behavior: Behavior;
  attemptId: string | null;
  hit: Promise<string>;
  resolveHit: (attemptId: string) => void;
  release: Promise<void>;
  resolveRelease: () => void;
};
const barriers = new Map<string, Barrier>();

export class ExportQaBarrierError extends Error {
  readonly name = "ExportQaBarrierError";
  constructor(readonly code: "qa_disabled" | "invalid_barrier" | "barrier_conflict" | "barrier_timeout" | "injected_failure") { super(code); }
}

export function armExportQaBarrier(token: string, phase: ExportQaPhase, behavior: Behavior): void {
  enabled(); if (!/^[A-Za-z0-9_-]{8,80}$/.test(token) || barriers.has(token)) fail(barriers.has(token) ? "barrier_conflict" : "invalid_barrier");
  let resolveHit = (_attemptId: string): void => {}; let resolveRelease = (): void => {};
  const hit = new Promise<string>((resolve) => { resolveHit = resolve; }); const release = new Promise<void>((resolve) => { resolveRelease = resolve; });
  barriers.set(token, { token, phase, behavior, attemptId: null, hit, resolveHit, release, resolveRelease });
}

export function exportQaHooks(token: string | null): ExportHooks {
  if (token === null) return {}; enabled(); const barrier = barriers.get(token); if (barrier === undefined || barrier.attemptId !== null) fail("invalid_barrier");
  return { phase: async (attemptId, phase, signal) => {
    if (phase !== barrier.phase) return;
    barrier.attemptId = attemptId; barrier.resolveHit(attemptId);
    if (barrier.behavior === "fail") { barriers.delete(token); throw new ExportQaBarrierError("injected_failure"); }
    try { await bounded(barrier.release, signal); } finally { barriers.delete(token); }
  } };
}

export function exportGcQaHook(token: string | null): ((attemptId: string, phase: "gc_after_tombstone_before_unlink" | "gc_after_unlink", signal: AbortSignal) => Promise<void>) | undefined {
  if (token === null) return undefined; enabled(); const barrier = barriers.get(token); if (barrier === undefined || barrier.attemptId !== null) fail("invalid_barrier");
  return async (attemptId, phase, signal) => {
    if (phase !== barrier.phase) return; barrier.attemptId = attemptId; barrier.resolveHit(attemptId);
    try { await bounded(barrier.release, signal); } finally { barriers.delete(token); }
  };
}

export async function waitForExportQaBarrier(token: string, signal: AbortSignal): Promise<string> {
  enabled(); const barrier = barriers.get(token); if (barrier === undefined) fail("invalid_barrier"); return bounded(barrier.hit, signal);
}
export function releaseExportQaBarrier(token: string): string {
  enabled(); const barrier = barriers.get(token); if (barrier === undefined || barrier.attemptId === null) fail("invalid_barrier"); barrier.resolveRelease(); return barrier.attemptId;
}

async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) fail("barrier_timeout");
  const timeout = AbortSignal.timeout(TIMEOUT_MS); const combined = AbortSignal.any([signal, timeout]);
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(new ExportQaBarrierError("barrier_timeout")); combined.addEventListener("abort", abort, { once: true });
    promise.then((value) => { combined.removeEventListener("abort", abort); resolve(value); }, reject);
  });
}
function enabled(): void { if (process.env.BG_EXPORT_QA !== "1") fail("qa_disabled"); }
function fail(code: ExportQaBarrierError["code"]): never { throw new ExportQaBarrierError(code); }
