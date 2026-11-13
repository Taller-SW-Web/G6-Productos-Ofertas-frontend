import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

export interface TaxonomyOperation {
  operationId: string;
  status: "PENDING_DEACTIVATION" | "COMPLETED" | "REJECTED";
  result: string | null;
  code: string | null;
}

export async function getTaxonomyOperation(transport: TaxonomyGatewayTransport, operationId: string, signal: AbortSignal): Promise<TaxonomyOperation> {
  if (!operationId.trim()) throw new Error("Identificador de operación inválido.");
  const response = await transport.request(`/api/v1/taxonomia/operaciones/${encodeURIComponent(operationId)}`, signal, undefined, { authenticated: true });
  if (!response.ok) throw new Error(`No se pudo consultar la operación (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Respuesta de operación inválida.");
  const dto = data as Record<string, unknown>;
  if (dto.operation_id !== operationId || !["PENDING_DEACTIVATION", "COMPLETED", "REJECTED"].includes(String(dto.status)) || !(dto.result === null || typeof dto.result === "string") || !(dto.code === null || typeof dto.code === "string")) throw new Error("Respuesta de operación inválida.");
  return { operationId, status: dto.status as TaxonomyOperation["status"], result: dto.result, code: dto.code };
}
