import type { BulkResumeRequest } from "../types/bulk";

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
      const saved = JSON.parse(raw) as { owner?: string; batchId?: string; correlationId?: string; originalCorrelationId?: string };
      if (saved.owner === owner && saved.batchId === batchId && uuidPattern.test(saved.correlationId ?? "") &&
          (originalCorrelationId === undefined || saved.originalCorrelationId === originalCorrelationId)) {
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
  storage.setItem(key, JSON.stringify({ owner, batchId, correlationId: request.correlationId, ...(originalCorrelationId ? { originalCorrelationId } : {}) }));
  return request;
}

export function clearBulkResumeRequest(owner: string, batchId: string, storage: Storage = sessionStorage): void {
  storage.removeItem(`g6:bulk:resume-intent:${encodeURIComponent(owner)}:${encodeURIComponent(batchId)}`);
}

