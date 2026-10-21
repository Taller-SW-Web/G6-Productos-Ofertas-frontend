export type InventoryErrorCode =
  // Códigos de negocio ya usados por el adaptador mock y el contrato OpenAPI.
  | "VALIDACION"
  | "TRASLADO_NO_ENCONTRADO"
  | "TRASLADO_NO_RECIBIBLE"
  | "CANTIDAD_INVALIDA"
  | "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO"
  | "DISPOSICION_RECEPCION_INVALIDA"
  | "IDEMPOTENCY_CONFLICT"
  // Estado operativo local usado por el mock persistente (master).
  | "OPERATIVO"
  // Protocolo HTTP del provider (OpenAPI: TOKEN_INVALIDO/SCOPE_INSUFICIENTE/
  // SERVICIO_NO_DISPONIBLE) y estado de una operación de escritura.
  | "NO_AUTENTICADO"
  | "SIN_PERMISO"
  | "SERVICIO_NO_DISPONIBLE"
  | "RESULTADO_INCIERTO"
  // La respuesta no cumple el contrato vigente, o falta una dependencia
  // autoritativa que el composition root debe inyectar (nunca se sustituye
  // por un mock).
  | "RESPUESTA_INCOMPATIBLE"
  | "CONTRATO_BLOQUEADO";

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;

  constructor(code: InventoryErrorCode, message: string) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
  }
}
