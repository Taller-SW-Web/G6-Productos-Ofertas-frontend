export type InventoryErrorCode =
  | "VALIDACION"
  | "TRASLADO_NO_ENCONTRADO"
  | "TRASLADO_NO_RECIBIBLE"
  | "CANTIDAD_INVALIDA"
  | "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"
  | "DISPOSICION_RECEPCION_INVALIDA"
  | "IDEMPOTENCY_CONFLICT";

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
  }
}
