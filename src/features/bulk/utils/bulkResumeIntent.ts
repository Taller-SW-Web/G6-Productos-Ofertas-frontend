import type { BulkResumeRequest } from "../types/bulk";

export type BulkResumeIntentStatus = "REQUESTED" | "UNCERTAIN" | "ACCEPTED_PENDING_REFRESH";
export interface StoredBulkResumeIntent extends BulkResumeRequest {
  owner: string;
  batchId: string;
  status: BulkResumeIntentStatus;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateBulkResumeRequest(
  owner: string,
  batchId: string,
  storage: Storage = sessionStorage,
  originalCorrelationId?: string,
): BulkResumeRequest {
  if (originalCorrelationId !== undefined && !uuidPattern.test(originalCorrelationId)) {
    throw new Error("La correlación original del lote no es válida; no se envió el POST.");
  }
  const key = `g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`;
  const raw = storage.getItem(key);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Partial<StoredBulkResumeIntent>;
      if (saved.owner === owner && saved.batchId === batchId && uuidPattern.test(saved.correlationId ?? "") &&
          (originalCorrelationId === undefined || saved.originalCorrelationId === originalCorrelationId) &&
          (saved.status === undefined || saved.status === "REQUESTED" || saved.status === "UNCERTAIN" || saved.status === "ACCEPTED_PENDING_REFRESH")) {
        return {
          correlationId: saved.correlationId!, motivo: null,
          ...(saved.originalCorrelationId ? { originalCorrelationId: saved.originalCorrelationId } : {}),
        };
      }
    } catch { /* corrupt intent is replaced only before any new request was sent */ }
    throw new Error("La identidad de reanudación guardada es inválida; no se envió el POST.");
  }
  const request = {
    correlationId: crypto.randomUUID(), motivo: null,
    ...(originalCorrelationId ? { originalCorrelationId } : {}),
  } as const;
  storage.setItem(key, JSON.stringify({ owner, batchId, correlationId: request.correlationId, status: "REQUESTED", ...(originalCorrelationId ? { originalCorrelationId } : {}) }));
  return request;
}

export function getBulkResumeIntent(owner: string, batchId: string, storage: Storage = sessionStorage): StoredBulkResumeIntent | undefined {
  const key = `g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`;
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  try {
    const saved = JSON.parse(raw) as Partial<StoredBulkResumeIntent>;
    if (saved.owner !== owner || saved.batchId !== batchId || !uuidPattern.test(saved.correlationId ?? "") ||
        (saved.status !== undefined && saved.status !== "REQUESTED" && saved.status !== "UNCERTAIN" && saved.status !== "ACCEPTED_PENDING_REFRESH")) return undefined;
    if (saved.originalCorrelationId !== undefined && !uuidPattern.test(saved.originalCorrelationId)) return undefined;
    return { owner, batchId, correlationId: saved.correlationId!, motivo: null, status: saved.status ?? "REQUESTED",
      ...(saved.originalCorrelationId ? { originalCorrelationId: saved.originalCorrelationId } : {}) };
  } catch { return undefined; }
}

export function hasAcceptedBulkResumeForBatch(batchId: string, storage: Storage = sessionStorage): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith("g6:bulk:resume-intent:")) continue;
    try {
      const value = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredBulkResumeIntent> | null;
      if (value?.batchId === batchId && value.status === "ACCEPTED_PENDING_REFRESH" &&
          typeof value.owner === "string" && uuidPattern.test(value.correlationId ?? "")) return true;
    } catch { /* malformed markers never authorize clearing another user's state */ }
  }
  return false;
}

export function hasUncertainBulkResumeForBatch(batchId: string, storage: Storage = sessionStorage): boolean {
  const suffix = `:${encodeURIComponent(batchId)}`;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith("g6:bulk:resume-intent:")) continue;
    try {
      const value = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredBulkResumeIntent> | null;
      if (value?.batchId === batchId && (value.status === undefined || value.status === "UNCERTAIN" || value.status === "REQUESTED") &&
          typeof value.owner === "string" && uuidPattern.test(value.correlationId ?? "")) return true;
    } catch { if (key.endsWith(suffix)) return true; }
  }
  return false;
}

export function markBulkResumeAccepted(owner: string, batchId: string, correlationId: string, originalCorrelationId?: string, storage: Storage = sessionStorage): void {
  storage.setItem(`g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`, JSON.stringify({
    owner, batchId, correlationId, status: "ACCEPTED_PENDING_REFRESH",
    ...(originalCorrelationId ? { originalCorrelationId } : {}),
  }));
}

export function markBulkResumeUncertain(owner: string, batchId: string, storage: Storage = sessionStorage): void {
  const intent = getBulkResumeIntent(owner, batchId, storage);
  if (!intent) return;
  storage.setItem(`g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`, JSON.stringify({
    owner, batchId, correlationId: intent.correlationId, status: "UNCERTAIN",
    ...(intent.originalCorrelationId ? { originalCorrelationId: intent.originalCorrelationId } : {}),
  }));
}

export function clearBulkResumeRequest(owner: string, batchId: string, storage: Storage = sessionStorage): void {
  storage.removeItem(`g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`);
}

