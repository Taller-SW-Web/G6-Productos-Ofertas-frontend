import { PricingFailure } from "../services/pricingModels";
import type { PricingRepository, ImportInput } from "../services/pricingRepository";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const prefix = "g6:pricing:import:v1:";
const pendingMessage = "El resultado no está confirmado. Selecciona el mismo CSV para recuperar el lote.";

type StoredIntent = {
  key: string;
  digest: string;
  allowPartial: boolean;
  batchId?: string;
};

function storageFailure() {
  return new PricingFailure("configuration", "El navegador no permite recuperar de forma segura la importación.");
}

function readIntent(storageKey: string): StoredIntent | null {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) return null;
    const intent: Partial<StoredIntent> = JSON.parse(value);
    if (!intent || typeof intent.key !== "string" || !uuid.test(intent.key) ||
        typeof intent.digest !== "string" || !/^[0-9a-f]{64}$/.test(intent.digest) ||
        typeof intent.allowPartial !== "boolean" ||
        (intent.batchId !== undefined && (typeof intent.batchId !== "string" || !uuid.test(intent.batchId))))
      throw storageFailure();
    return { key: intent.key, digest: intent.digest, allowPartial: intent.allowPartial, batchId: intent.batchId };
  } catch {
    throw storageFailure();
  }
}

function changeIntent(storageKey: string, intent: StoredIntent | null) {
  try {
    if (intent) localStorage.setItem(storageKey, JSON.stringify(intent));
    else localStorage.removeItem(storageKey);
  } catch {
    throw storageFailure();
  }
}

export function acceptedImportId(payload: unknown, allowPartial: boolean): string {
  if (payload === null || typeof payload !== "object")
    throw new PricingFailure("unknown", pendingMessage);
  const dto = payload as Record<string, unknown>;
  if (dto.status !== "QUEUED" || dto.allow_partial !== allowPartial ||
      typeof dto.batch_id !== "string" || !uuid.test(dto.batch_id) ||
      typeof dto.correlation_id !== "string" || !uuid.test(dto.correlation_id))
    throw new PricingFailure("unknown", pendingMessage);
  return dto.batch_id;
}

export function createPriceImportAdmission(
  currentOwner: () => string | null,
  send: (input: ImportInput, key: string, signal: AbortSignal) => Promise<string>,
): NonNullable<PricingRepository["importAdmission"]> {
  return {
    canSubmit: () => currentOwner() !== null,
    recovery: () => {
      const owner = currentOwner();
      if (owner === null) return null;
      try {
        const intent = readIntent(prefix + owner);
        return intent && { allowPartial: intent.allowPartial, batchId: intent.batchId };
      } catch {
        return null;
      }
    },
    async submit(input, signal, recover) {
      const owner = currentOwner();
      if (owner === null)
        throw new PricingFailure("forbidden", "Tu sesión no permite admitir importaciones.");
      if (!navigator.locks || !crypto.subtle) throw storageFailure();
      const storageKey = prefix + owner;
      return navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new PricingFailure("unknown", "Ya se está confirmando una importación en otra pestaña.");
        signal.throwIfAborted();
        const previous = readIntent(storageKey);
        const bytes = await crypto.subtle.digest("SHA-256", await input.file.arrayBuffer());
        const digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
        signal.throwIfAborted();
        if (currentOwner() !== owner)
          throw new PricingFailure("forbidden", "La sesión cambió durante la confirmación.");
        const same = previous?.digest === digest && previous.allowPartial === input.allowPartial;
        if (same && previous.batchId) return previous.batchId;
        if (!same && (recover || (previous && !previous.batchId)))
          throw new PricingFailure("conflict", "Selecciona el mismo archivo y la misma política de la importación pendiente.");
        const intent = same ? previous : { key: crypto.randomUUID(), digest, allowPartial: input.allowPartial };
        changeIntent(storageKey, intent);
        let batchId: string;
        try {
          batchId = await send(input, intent.key, signal);
        } catch (error) {
          if (!same && error instanceof PricingFailure && [400, 401, 403, 413, 422].includes(error.status ?? 0))
            changeIntent(storageKey, previous);
          if (error instanceof PricingFailure && error.kind !== "unknown") throw error;
          throw new PricingFailure("unknown", pendingMessage);
        }
        try {
          changeIntent(storageKey, { ...intent, batchId });
        } catch {
          // The original key remains recoverable, and this response identifies the lot.
        }
        return batchId;
      });
    },
  };
}
