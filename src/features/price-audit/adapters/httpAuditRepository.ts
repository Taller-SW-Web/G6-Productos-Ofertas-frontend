import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import {
  AuditFailure,
  type AuditEntry,
  type AuditExportInput,
  type AuditFormat,
  type AuditJob,
  type AuditPage,
  type AuditQuery,
  type AuditRepository,
} from "../services/auditRepository";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuditFailure("unknown", "La respuesta de Auditoría no coincide con el contrato.");
  return value as Record<string, unknown>;
}

function requiredText(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string")
    throw new AuditFailure("unknown", "La respuesta de Auditoría está incompleta.");
  return value;
}

function nullableText(source: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(source, key)) return null;
  const value = source[key];
  if (value !== null && typeof value !== "string")
    throw new AuditFailure("unknown", "La respuesta de Auditoría contiene campos incompatibles.");
  return value as string | null;
}

function nullableMoney(source: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(source, key))
    throw new AuditFailure("unknown", "La respuesta de Auditoría está incompleta.");
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new AuditFailure("unknown", "La respuesta de Auditoría contiene un importe inválido.");
  return value.toString();
}

function nullableNumber(source: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(source, key))
    throw new AuditFailure("unknown", "La respuesta de Auditoría está incompleta.");
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new AuditFailure("unknown", "La respuesta de Auditoría contiene una variación inválida.");
  return value.toString();
}

function validDate(value: string): string {
  if (!Number.isFinite(Date.parse(value)) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    throw new AuditFailure("unknown", "La respuesta de Auditoría contiene una fecha inválida.");
  return value;
}

function mapEntry(value: unknown): AuditEntry {
  const dto = record(value);
  const priceType = requiredText(dto, "tipo_precio");
  const operation = requiredText(dto, "tipo_operacion");
  if (priceType !== "REGULAR" && priceType !== "OFERTA")
    throw new AuditFailure("unknown", "Auditoría devolvió un tipo de precio desconocido.");
  if (!["CREACION", "MODIFICACION", "RETIRO_OFERTA"].includes(operation))
    throw new AuditFailure("unknown", "Auditoría devolvió una operación desconocida.");
  return {
    id: requiredText(dto, "id_auditoria"),
    sku: requiredText(dto, "sku"),
    productId: requiredText(dto, "product_id"),
    priceType,
    before: nullableMoney(dto, "precio_anterior"),
    after: nullableMoney(dto, "precio_nuevo"),
    variation: nullableNumber(dto, "variacion_porcentual"),
    operation: operation as AuditEntry["operation"],
    origin: requiredText(dto, "canal_origen"),
    reason: requiredText(dto, "motivo_cambio"),
    batchId: nullableText(dto, "batch_id"),
    actorId: nullableText(dto, "usuario_id"),
    email: nullableText(dto, "usuario_email"),
    ip: nullableText(dto, "ip_origen"),
    at: validDate(requiredText(dto, "timestamp")),
  };
}

function mapJob(value: unknown): AuditJob {
  const dto = record(value);
  const status = requiredText(dto, "status");
  const format = requiredText(dto, "formato");
  if (!["QUEUED", "PROCESSING", "COMPLETED", "FAILED_GENERAL"].includes(status))
    throw new AuditFailure("unknown", "Auditoría devolvió un estado de exportación desconocido.");
  if (format !== "CSV" && format !== "PDF")
    throw new AuditFailure("unknown", "Auditoría devolvió un formato de exportación no solicitado.");
  const downloadUrl = nullableText(dto, "download_url");
  return {
    id: requiredText(dto, "export_id"),
    format,
    status: status as AuditJob["status"],
    createdAt: validDate(requiredText(dto, "created_at")),
    completedAt: dto.completed_at === null
      ? null
      : dto.completed_at === undefined
        ? null
        : validDate(requiredText(dto, "completed_at")),
    fileAvailable: status === "COMPLETED" && downloadUrl !== null,
  };
}

function queryString(query: AuditQuery): string {
  const params = new URLSearchParams({ pagina: String(query.page), tamanio: String(query.size) });
  for (const [key, value] of Object.entries({
    sku: query.sku,
    desde: query.desde,
    hasta: query.hasta,
    usuarioId: query.usuarioId,
    canal: query.canal,
    batchId: query.batchId,
  })) if (value) params.set(key, value);
  return params.toString();
}

function filtersBody(input: AuditExportInput): Record<string, string | null> {
  return {
    formato: input.format,
    sku: input.filters.sku || null,
    desde: input.filters.desde || null,
    hasta: input.filters.hasta || null,
    usuarioId: input.filters.usuarioId || null,
    canal: input.filters.canal || null,
    batchId: input.filters.batchId || null,
  };
}

function failure(status: number): AuditFailure {
  if (status === 401) return new AuditFailure("session", "La sesión no es válida o expiró. Inicia sesión de nuevo.");
  if (status === 403) return new AuditFailure("forbidden", "Tu sesión no tiene permiso para consultar la auditoría.");
  if (status === 413 || status === 422) return new AuditFailure("limit", "El resultado supera el límite de exportación. Reduce los filtros.");
  if (status === 429) return new AuditFailure("unavailable", "Se alcanzó el límite de consultas. Intenta más tarde.");
  if (status >= 500) return new AuditFailure("unavailable", `Auditoría no está disponible temporalmente (HTTP ${status}).`);
  return new AuditFailure("unknown", `No se pudo completar la operación de auditoría (HTTP ${status}).`);
}

export function createHttpAuditRepository(client: AuthenticatedGatewayClient): AuditRepository {
  async function json(path: string, init: { method: "GET" | "POST"; signal: AbortSignal; body?: string }): Promise<unknown> {
    let response: Response;
    try {
      response = await client.request(path, {
        ...init,
        headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (init.signal.aborted) throw error;
      throw new AuditFailure("unavailable", "No se pudo conectar con Auditoría de precios.");
    }
    if (!response.ok) throw failure(response.status);
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
      throw new AuditFailure("unknown", "Auditoría devolvió un tipo de respuesta incompatible.");
    try { return await response.json(); }
    catch { throw new AuditFailure("unknown", "Auditoría devolvió una respuesta JSON ilegible."); }
  }

  return {
    async list(query, signal) {
      if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.size) || query.size < 1 || query.size > 200)
        throw new AuditFailure("unknown", "La página solicitada no es válida.");
      const dto = record(await json(`/api/v1/auditoria-precios?${queryString(query)}`, { method: "GET", signal }));
      if (!Array.isArray(dto.items)) throw new AuditFailure("unknown", "Auditoría no devolvió una lista de registros.");
      const meta = record(dto.meta);
      const page = meta.pagina, size = meta.tamanio, total = meta.total, pages = meta.totalPaginas;
      if (![page, size, total, pages].every(Number.isSafeInteger) || page !== query.page || size !== query.size || Number(total) < 0 || Number(pages) < 0)
        throw new AuditFailure("unknown", "La paginación de Auditoría no coincide con la solicitud.");
      return { items: dto.items.map(mapEntry), page: Number(page), size: Number(size), total: Number(total), pages: Number(pages) } satisfies AuditPage;
    },
    async detail(id, signal) {
      if (!id.trim()) throw new AuditFailure("unknown", "El identificador de auditoría no es válido.");
      const encoded = encodeURIComponent(id);
      try { return mapEntry(await json(`/api/v1/auditoria-precios/${encoded}`, { method: "GET", signal })); }
      catch (error) {
        if (error instanceof AuditFailure && error.kind === "unknown" && error.message.includes("HTTP 404")) return null;
        throw error;
      }
    },
    async requestExport(input, signal) {
      const dto = await json("/api/v1/auditoria-precios/exportaciones", {
        method: "POST", signal, body: JSON.stringify(filtersBody(input)),
      });
      return mapJob(dto);
    },
    async getExport(id, signal) {
      if (!id.trim()) throw new AuditFailure("unknown", "El identificador de exportación no es válido.");
      try { return mapJob(await json(`/api/v1/auditoria-precios/exportaciones/${encodeURIComponent(id)}`, { method: "GET", signal })); }
      catch (error) {
        if (error instanceof AuditFailure && error.kind === "unknown" && error.message.includes("HTTP 404")) return null;
        throw error;
      }
    },
    async download(id, signal) {
      if (!id.trim()) throw new AuditFailure("unknown", "El identificador de exportación no es válido.");
      let response: Response;
      try {
        response = await client.request(`/api/v1/auditoria-precios/exportaciones/${encodeURIComponent(id)}/archivo`, { method: "GET", signal, headers: { Accept: "text/csv, application/pdf" } });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new AuditFailure("unavailable", "No se pudo conectar para descargar la auditoría.");
      }
      if (!response.ok) throw failure(response.status);
      const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      const format: AuditFormat | null = mime === "text/csv" ? "CSV" : mime === "application/pdf" ? "PDF" : null;
      if (!format) throw new AuditFailure("unknown", "Auditoría devolvió un archivo con formato no reconocido.");
      try {
        return { data: await response.blob(), filename: `auditoria-precios.${format.toLowerCase()}` };
      } catch {
        throw new AuditFailure("unknown", "No se pudo leer el archivo de auditoría.");
      }
    },
  };
}
