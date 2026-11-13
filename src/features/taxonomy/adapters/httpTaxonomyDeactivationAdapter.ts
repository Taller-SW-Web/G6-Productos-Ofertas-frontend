import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

export async function solicitarBajaHttp(transport: TaxonomyGatewayTransport, entity: "categorias" | "marcas", id: string, signal: AbortSignal): Promise<string> {
  const response = await transport.request(`/api/v1/${entity}/${encodeURIComponent(id)}/desactivar`, signal, undefined, { method: "POST" });
  if (response.status !== 202) throw new Error(`Respuesta de admisión inesperada (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("operation_id" in data) || typeof data.operation_id !== "string" || !data.operation_id.trim()) throw new Error("Respuesta de admisión inválida; verifica el estado antes de reintentar.");
  return data.operation_id;
}
