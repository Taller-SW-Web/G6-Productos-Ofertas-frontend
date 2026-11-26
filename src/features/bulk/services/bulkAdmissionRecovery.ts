import { getBulkPollDelay } from "../hooks/bulkQueryState";
import type { BulkAdmissionReconciliation, BulkImportIntent } from "../types/bulk";

export type BulkAdmissionRecoveryResult =
  | { status: "confirmed"; admission: BulkAdmissionReconciliation }
  | { status: "timed_out" }
  | { status: "owner_changed" }
  | { status: "cancelled" }
  | { status: "authentication_required" }
  | { status: "blocked"; message: string };

export interface BulkAdmissionRecoveryRepository {
  reconcileImport?: (
    correlationId: string,
    expectedOwner: string,
    signal?: AbortSignal,
  ) => Promise<BulkAdmissionReconciliation | null>;
  reconciliationEnabled?: boolean;
}

function waitForNextPoll(delay: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function reconcileBulkAdmission(input: {
  repository: BulkAdmissionRecoveryRepository;
  intent: BulkImportIntent;
  signal: AbortSignal;
  isOwnerCurrent: () => boolean;
  timeoutMs?: number;
  now?: () => number;
  random?: () => number;
}): Promise<BulkAdmissionRecoveryResult> {
  if (!input.repository.reconciliationEnabled || !input.repository.reconcileImport) {
    return { status: "blocked", message: "La conciliación no está habilitada con evidencia compatible." };
  }
  const timeoutMs = input.timeoutMs ?? 60_000;
  const now = input.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineController = new AbortController();
  let deadlineReached = false;
  const deadlineTimer = setTimeout(() => {
    deadlineReached = true;
    deadlineController.abort();
  }, timeoutMs);
  const signal = AbortSignal.any([input.signal, deadlineController.signal]);
  let attempt = 0;
  try {
    while (!signal.aborted) {
      if (!input.isOwnerCurrent()) return { status: "owner_changed" };
      let admission: BulkAdmissionReconciliation | null;
      try {
        admission = await input.repository.reconcileImport(input.intent.correlationId, input.intent.owner, signal);
      } catch (error) {
        if (input.signal.aborted) return { status: "cancelled" };
        if (deadlineReached) return { status: "timed_out" };
        if (!input.isOwnerCurrent()) return { status: "owner_changed" };
        const status = typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : undefined;
        const category = typeof error === "object" && error !== null && "category" in error ? (error as { category?: unknown }).category : undefined;
        const errorName = typeof error === "object" && error !== null && "name" in error ? (error as { name?: unknown }).name : undefined;
        if (status === 401 || status === 403) return { status: "authentication_required" };
        if (status === 400) return { status: "blocked", message: error instanceof Error ? error.message : "La correlación no fue aceptada por el servicio." };
        if (category !== "communication" && status !== 503 && status !== 408 && status !== 429 && errorName !== "TimeoutError" && errorName !== "AbortError") {
          return { status: "blocked", message: error instanceof Error ? error.message : "La conciliación no pudo validarse." };
        }
        admission = null;
      }
      if (input.signal.aborted) return { status: "cancelled" };
      if (deadlineReached) return { status: "timed_out" };
      if (!input.isOwnerCurrent()) return { status: "owner_changed" };
      if (admission) return { status: "confirmed", admission };

      const remaining = timeoutMs - (now() - startedAt);
      if (remaining <= 0) return { status: "timed_out" };
      const delay = Math.min(getBulkPollDelay(attempt++, input.random), remaining);
      if (!(await waitForNextPoll(delay, signal))) return input.signal.aborted ? { status: "cancelled" } : { status: "timed_out" };
    }
    return input.signal.aborted ? { status: "cancelled" } : { status: "timed_out" };
  } finally {
    clearTimeout(deadlineTimer);
  }
}

