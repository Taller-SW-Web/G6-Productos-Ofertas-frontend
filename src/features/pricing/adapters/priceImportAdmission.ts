import { PricingFailure } from "../services/pricingModels";
import type { PricingRepository, ImportInput } from "../services/pricingRepository";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const prefix = "g6:pricing:import:v1:";
const pendingMessage = "El resultado no está confirmado. Selecciona el mismo CSV para recuperar el lote.";

type StoredIntent = {
  key: string;
  digest: string;
  allowPartial: boolean;
};
type StoredImports = { pending?: StoredIntent; lastBatchId?: string };

function storageFailure() {
  return new PricingFailure("configuration", "El navegador no permite recuperar de forma segura la importación.");
}

function validIntent(value: unknown): value is StoredIntent {
  if (!value || typeof value !== "object") return false;
  const { key, digest, allowPartial } = value as Partial<StoredIntent>;
  return typeof key === "string" && uuid.test(key) &&
    typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest) &&
    typeof allowPartial === "boolean";
}

function readImports(storageKey: string): StoredImports {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) return {};
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== "object") throw storageFailure();
    // The first version stored a single pending intent or a confirmed receipt.
    if (validIntent(data)) {
      const { batchId } = data as StoredIntent & { batchId?: unknown };
      if (batchId === undefined) return { pending: data };
      if (typeof batchId === "string" && uuid.test(batchId)) return { lastBatchId: batchId };
      throw storageFailure();
    }
    const { version, pending, lastBatchId } = data as Partial<StoredImports> & { version?: unknown };
    if (version !== 2 || (pending !== undefined && !validIntent(pending)) ||
        (lastBatchId !== undefined && (typeof lastBatchId !== "string" || !uuid.test(lastBatchId))))
      throw storageFailure();
    return { pending, lastBatchId };
  } catch {
    throw storageFailure();
  }
}

function writeImports(storageKey: string, state: StoredImports) {
  try {
    if (state.pending || state.lastBatchId)
      localStorage.setItem(storageKey, JSON.stringify({ version: 2, ...state }));
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
  function withLock<T>(signal: AbortSignal, action: (storageKey: string, owner: string) => Promise<T>) {
    const owner = currentOwner();
    if (owner === null)
      throw new PricingFailure("forbidden", "Tu sesión no permite administrar importaciones.");
    if (!navigator.locks) throw storageFailure();
    const storageKey = prefix + owner;
    return navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new PricingFailure("unknown", "Ya se está atendiendo una importación en otra pestaña.");
      signal.throwIfAborted();
      if (currentOwner() !== owner)
        throw new PricingFailure("forbidden", "La sesión cambió durante la confirmación.");
      return action(storageKey, owner);
    });
  }
  const changedIntent = () =>
    new PricingFailure("conflict", "El intento pendiente cambió. Revisa la importación antes de continuar.");

  return {
    canSubmit: () => currentOwner() !== null,
    recovery: () => {
      const owner = currentOwner();
      if (owner === null) return null;
      try {
        const { pending, lastBatchId } = readImports(prefix + owner);
        return {
          lastBatchId,
          pending: pending && { key: pending.key, allowPartial: pending.allowPartial },
        };
      } catch {
        return null;
      }
    },
    async submit(input, signal, recoveryKey) {
      if (!crypto.subtle) throw storageFailure();
      return withLock(signal, async (storageKey, owner) => {
        const previous = readImports(storageKey);
        const pending = previous.pending;
        if (recoveryKey && pending?.key !== recoveryKey) throw changedIntent();
        if (!recoveryKey && pending)
          throw new PricingFailure("conflict", "Recupera o descarta el intento pendiente antes de iniciar otra importación.");
        const bytes = await crypto.subtle.digest("SHA-256", await input.file.arrayBuffer());
        const digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
        signal.throwIfAborted();
        if (currentOwner() !== owner)
          throw new PricingFailure("forbidden", "La sesión cambió durante la confirmación.");
        if (pending && (pending.digest !== digest || pending.allowPartial !== input.allowPartial))
          throw new PricingFailure("conflict", "Selecciona el mismo archivo y la misma política de la importación pendiente.");
        const intent = pending ?? { key: crypto.randomUUID(), digest, allowPartial: input.allowPartial };
        if (!pending) writeImports(storageKey, { ...previous, pending: intent });
        let batchId: string;
        try {
          batchId = await send(input, intent.key, signal);
        } catch (error) {
          if (!pending && error instanceof PricingFailure && [400, 401, 403, 413, 422].includes(error.status ?? 0))
            writeImports(storageKey, previous);
          if (error instanceof PricingFailure && error.kind !== "unknown") throw error;
          throw new PricingFailure("unknown", pendingMessage);
        }
        try {
          writeImports(storageKey, { lastBatchId: batchId });
        } catch {
          // The original key remains recoverable, and this response identifies the lot.
        }
        return batchId;
      });
    },
    async discard(key, signal) {
      await withLock(signal, async (storageKey) => {
        const { pending, lastBatchId } = readImports(storageKey);
        if (pending?.key !== key) throw changedIntent();
        writeImports(storageKey, { lastBatchId });
      });
    },
  };
}
