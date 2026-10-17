import type { DataMode } from "../../../app/config/dataMode";
import type { BulkExportFormat } from "../types/bulk";
import { BulkRepositoryError } from "./bulkErrors";

export type BulkDownloadKind = "plantilla" | "exportación";

export function getUnavailableDownloadMessage(
  mode: DataMode,
  kind: BulkDownloadKind,
  format: BulkExportFormat,
): string {
  if (mode === "mock" && format === "XLSX") {
    return `El modo mock no incluye un archivo XLSX descargable para esta ${kind}.`;
  }
  if (mode === "api") {
    return `El provider API configurado no entregó el recurso de ${kind} solicitado (${format}).`;
  }
  return `El recurso de ${kind} solicitado (${format}) no está disponible en este escenario de demostración.`;
}

export function getDownloadFailureMessage(
  error: unknown,
  kind: BulkDownloadKind,
): string {
  if (error instanceof BulkRepositoryError && error.category === "communication") {
    return `Error de comunicación al obtener la ${kind}: ${error.message}`;
  }
  return error instanceof Error
    ? error.message
    : `No se pudo obtener la ${kind}.`;
}
