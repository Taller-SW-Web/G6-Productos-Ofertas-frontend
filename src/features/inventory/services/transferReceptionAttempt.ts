import { InventoryError } from "./inventoryErrors";
import type {
  DispositionType,
  ReceiveTransferPayload,
} from "./inventoryTypes";

// Gestión inmutable de intentos de recepción de traslados (TAC-P0-01 / TAC-P0-02).
//
// El backend (`traslados.service.ts`) calcula el fingerprint de idempotencia con:
//   traslado_id, received_quantity, disposition, final_receipt, received_at,
//   note ?? null, intention = "recepcion_traslado".
// Por tanto:
//   1. Un reintento de la misma operación debe reutilizar EXACTAMENTE el mismo
//      `operationId`, `receivedAt`, `quantityReceived`, `disposition`,
//      `finalReceipt` y `note` (idéntica `Idempotency-Key` e idéntico JSON).
//   2. Cualquier cambio de cantidad, disposición, recepción final o nota
//      constituye una intención distinta y nunca puede reutilizar `operationId`.
//   3. Mientras una recepción esté en estado `UNCERTAIN` (respuesta perdida o
//      fallo >=500), no se permite mutar el contenido ni sustituir `operationId`
//      al cerrar/reabrir el modal o tras un `GET /inventario/traslados` genérico.

export type TransferReceptionWriteState =
  | "IN_FLIGHT"
  | "UNCERTAIN"
  | "RECONCILED";

export type TransferReceptionReconciliationStatus =
  | "NONE"
  | "UNVERIFIABLE_BY_LIST_CONTRACT"
  | "CONFIRMED_BY_IDEMPOTENT_RETRY";

export interface TransferReceptionWriteRecord {
  readonly state: TransferReceptionWriteState;
  readonly payload: Readonly<ReceiveTransferPayload>;
  readonly reconciliation: TransferReceptionReconciliationStatus;
  readonly updatedAt: string;
}

export interface TransferReceptionDraftInput {
  readonly quantityReceived: number;
  readonly disposition: DispositionType;
  readonly finalReceipt: boolean;
  readonly note?: string;
}

export function createTransferOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeReceptionNote(
  note: string | undefined,
): string | undefined {
  if (note === undefined) return undefined;
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function computeReceiveTransferContentSignature(
  transferId: string,
  draft: TransferReceptionDraftInput,
): string {
  return JSON.stringify([
    transferId,
    draft.quantityReceived,
    draft.disposition,
    draft.finalReceipt,
    normalizeReceptionNote(draft.note) ?? null,
  ]);
}

export function freezeReceiveTransferPayload(
  payload: ReceiveTransferPayload,
): Readonly<ReceiveTransferPayload> {
  const normalizedNote = normalizeReceptionNote(payload.note);
  const copy: ReceiveTransferPayload = {
    transferId: payload.transferId,
    quantityReceived: payload.quantityReceived,
    disposition: payload.disposition,
    finalReceipt: payload.finalReceipt,
    operationId: payload.operationId,
    receivedAt: payload.receivedAt,
    ...(normalizedNote !== undefined ? { note: normalizedNote } : {}),
  };
  return Object.freeze(copy);
}

export function areSameReceiveTransferPayloads(
  a: ReceiveTransferPayload,
  b: ReceiveTransferPayload,
): boolean {
  return (
    a.transferId === b.transferId &&
    a.operationId === b.operationId &&
    a.quantityReceived === b.quantityReceived &&
    a.disposition === b.disposition &&
    a.finalReceipt === b.finalReceipt &&
    a.receivedAt === b.receivedAt &&
    (normalizeReceptionNote(a.note) ?? null) ===
      (normalizeReceptionNote(b.note) ?? null)
  );
}

// Registro compartido en memoria de operaciones inciertas por `transferId` para
// que cerrar y reabrir `ReceiveTransferModal` nunca pierda el snapshot inmutable
// ni genere silenciosamente una nueva operación mientras no exista conciliación.
const uncertainReceptionsByTransferId = new Map<
  string,
  Readonly<ReceiveTransferPayload>
>();

export function getUncertainTransferReception(
  transferId: string,
): Readonly<ReceiveTransferPayload> | null {
  return uncertainReceptionsByTransferId.get(transferId) ?? null;
}

export function setUncertainTransferReception(
  payload: ReceiveTransferPayload,
): Readonly<ReceiveTransferPayload> {
  const frozen = freezeReceiveTransferPayload(payload);
  uncertainReceptionsByTransferId.set(frozen.transferId, frozen);
  return frozen;
}

export function clearUncertainTransferReception(
  transferId: string,
  operationId?: string,
): void {
  const current = uncertainReceptionsByTransferId.get(transferId);
  if (!current) return;
  if (operationId !== undefined && current.operationId !== operationId) return;
  uncertainReceptionsByTransferId.delete(transferId);
}

export function resetUncertainTransferReceptions(): void {
  uncertainReceptionsByTransferId.clear();
}

export interface TransferReceptionFormSessionOptions {
  readonly createId?: () => string;
  readonly now?: () => string;
}

export interface TransferReceptionFormSession {
  readonly transferId: string;
  getUncertainPayload(): Readonly<ReceiveTransferPayload> | null;
  getLastAttemptPayload(): Readonly<ReceiveTransferPayload> | null;
  prepareSubmission(
    draft: TransferReceptionDraftInput,
  ): Readonly<ReceiveTransferPayload>;
  recordSuccess(payload: Readonly<ReceiveTransferPayload>): void;
  recordFailure(
    payload: Readonly<ReceiveTransferPayload>,
    error: unknown,
  ): Readonly<ReceiveTransferPayload> | null;
}

export function createTransferReceptionFormSession(
  transferId: string,
  options: TransferReceptionFormSessionOptions = {},
): TransferReceptionFormSession {
  const createId = options.createId ?? createTransferOperationId;
  const now = options.now ?? (() => new Date().toISOString());

  let lastAttempt: Readonly<ReceiveTransferPayload> | null =
    getUncertainTransferReception(transferId);

  return {
    transferId,

    getUncertainPayload(): Readonly<ReceiveTransferPayload> | null {
      return getUncertainTransferReception(transferId);
    },

    getLastAttemptPayload(): Readonly<ReceiveTransferPayload> | null {
      return lastAttempt;
    },

    prepareSubmission(
      draft: TransferReceptionDraftInput,
    ): Readonly<ReceiveTransferPayload> {
      const uncertain = getUncertainTransferReception(transferId);
      const draftSignature = computeReceiveTransferContentSignature(
        transferId,
        draft,
      );

      if (uncertain) {
        const uncertainSignature = computeReceiveTransferContentSignature(
          transferId,
          uncertain,
        );
        if (draftSignature !== uncertainSignature) {
          throw new InventoryError(
            "RESULTADO_INCIERTO",
            "Existe una recepción con resultado incierto para este traslado. No se puede modificar la cantidad, disposición, cierre final ni nota hasta recuperar la confirmación de la solicitud original.",
          );
        }
        lastAttempt = uncertain;
        return uncertain;
      }

      if (lastAttempt) {
        const previousSignature = computeReceiveTransferContentSignature(
          transferId,
          lastAttempt,
        );
        if (draftSignature === previousSignature) {
          return lastAttempt;
        }
      }

      const normalizedNote = normalizeReceptionNote(draft.note);
      const created = freezeReceiveTransferPayload({
        transferId,
        quantityReceived: draft.quantityReceived,
        disposition: draft.disposition,
        finalReceipt: draft.finalReceipt,
        operationId: createId(),
        receivedAt: now(),
        ...(normalizedNote !== undefined ? { note: normalizedNote } : {}),
      });
      lastAttempt = created;
      return created;
    },

    recordSuccess(payload: Readonly<ReceiveTransferPayload>): void {
      clearUncertainTransferReception(transferId, payload.operationId);
      lastAttempt = payload;
    },

    recordFailure(
      payload: Readonly<ReceiveTransferPayload>,
      error: unknown,
    ): Readonly<ReceiveTransferPayload> | null {
      if (
        error instanceof InventoryError &&
        error.code === "RESULTADO_INCIERTO"
      ) {
        const stored = setUncertainTransferReception(payload);
        lastAttempt = stored;
        return stored;
      }
      return getUncertainTransferReception(transferId);
    },
  };
}
