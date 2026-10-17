import type { DataMode } from "../../../app/config/dataMode";

export function getQueuedBatchDescription(mode: DataMode): string {
  return mode === "mock"
    ? "La demostración mock representa la solicitud en cola y a la espera de iniciar el procesamiento."
    : "El provider configurado informa que el lote está en cola y a la espera de iniciar el procesamiento.";
}

export function getUnknownRowCountDescription(mode: DataMode): string {
  return mode === "mock"
    ? "El escenario de demostración no incluye un total de filas verificado ni permite confirmar el resultado final."
    : "El provider todavía no informa un total de filas verificado ni el resultado final.";
}
