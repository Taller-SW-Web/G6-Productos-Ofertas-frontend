import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { CombosRepository, Combo, ComboAvailability, ComboPayload, ComboPage, ComboQuery, CombosCatalogPort } from "../types/combos";

type AvailabilityDto = {
  comboId: string;
  verificable: boolean;
  cantidadInformativa: number | null;
  calculated_at: string;
  estadoActualizacion: "ACTUALIZADA" | "DESACTUALIZADA" | "INCOMPLETA";
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Respuesta de Combos inválida.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Respuesta de Combos incompleta.");
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error("Respuesta de Combos inválida.");
  return Number(value);
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") throw new Error("Respuesta de Combos inválida.");
  return value as string | null;
}
function minor(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("Combos devolvió un precio inválido.");
  const rendered = value.toString();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(rendered)) throw new Error("El precio de Combos excede la precisión monetaria publicada.");
  const [units, fraction = ""] = rendered.split(".");
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Combos devolvió un precio no representable.");
  return cents;
}
function mapAvailability(value: unknown, comboId: string, status: Combo["status"]): ComboAvailability {
  const dto = object(value) as unknown as AvailabilityDto;
  if (dto.comboId !== comboId || typeof dto.verificable !== "boolean" || !["ACTUALIZADA", "DESACTUALIZADA", "INCOMPLETA"].includes(dto.estadoActualizacion) || !Number.isFinite(Date.parse(dto.calculated_at)))
    throw new Error("Combos devolvió una disponibilidad incompatible con el contrato.");
  const quantity = dto.cantidadInformativa === null ? null : integer(dto.cantidadInformativa);
  if (dto.verificable && quantity === null) throw new Error("Combos no entregó la cantidad informativa requerida.");
  const freshness = dto.estadoActualizacion;
  const state = status === "INACTIVO"
    ? "COMBO_INACTIVO"
    : !dto.verificable || quantity === null
      ? freshness === "DESACTUALIZADA" ? "DESACTUALIZADA" : freshness === "INCOMPLETA" ? "INCOMPLETA" : "NO_VERIFICABLE"
      : quantity === 0 ? "AGOTADO" : "DISPONIBLE";
  return {
    state,
    verifiable: dto.verificable,
    quantity,
    freshness,
    calculatedAt: dto.calculated_at,
    reason: dto.verificable ? null : "La API de Combos no puede verificar la disponibilidad con una fuente común de inventario.",
  };
}

export function createHttpCombosRepository(client: AuthenticatedGatewayClient, catalog: CombosCatalogPort): CombosRepository {
  const uncertain = new Set<string>();
  async function request(path: string, method: "GET" | "POST" | "PATCH", signal?: AbortSignal, body?: unknown, expected = 200): Promise<unknown> {
    let response: Response;
    try {
      response = await client.request(path, {
        method,
        signal,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(method === "GET" ? "No se pudo conectar con Combos." : "No se pudo confirmar la escritura de Combos. Conserva la referencia y consulta el recurso antes de repetir la operación.");
    }
    if (!response.ok) {
      if (method !== "GET" && response.status >= 500) throw new Error(`Resultado de escritura incierto (HTTP ${response.status}); consulta Combos antes de crear otra operación.`);
      const bodyValue = await response.clone().json().catch(() => null) as { code?: unknown } | null;
      const code = typeof bodyValue?.code === "string" ? bodyValue.code : "ERROR_HTTP";
      throw new Error(`Combos respondió HTTP ${response.status} (${code}).`);
    }
    if (response.status !== expected || !response.headers.get("content-type")?.toLowerCase().includes("application/json"))
      throw new Error(method === "GET" ? "Combos devolvió una respuesta incompatible." : "La escritura no se pudo confirmar; consulta Combos antes de repetirla.");
    try { return await response.json(); }
    catch { throw new Error(method === "GET" ? "Combos devolvió JSON ilegible." : "La respuesta de escritura es ilegible; consulta Combos antes de repetirla."); }
  }
  async function availability(id: string, status: Combo["status"], signal?: AbortSignal): Promise<ComboAvailability> {
    return mapAvailability(await request(`/api/v1/combos/${encodeURIComponent(id)}/disponibilidad`, "GET", signal), id, status);
  }
  async function mapCombo(value: unknown, signal?: AbortSignal): Promise<Combo> {
    const dto = object(value);
    const id = text(dto.combo_id);
    if (dto.status !== "ACTIVO" && dto.status !== "INACTIVO") throw new Error("Combos devolvió un estado desconocido.");
    if (!Array.isArray(dto.components) || dto.components.length < 2) throw new Error("Combos devolvió componentes incompletos.");
    const rawComponents = dto.components.map((item) => {
      const component = object(item);
      return { sku: text(component.sku), quantity: integer(component.quantity, 1) };
    });
    const resolved = await catalog.resolveSkus(rawComponents.map((item) => item.sku), signal).catch(() => []);
    const names = new Map(resolved.map((item) => [item.sku, item.productName]));
    const status = dto.status;
    return {
      id,
      name: text(dto.name),
      description: nullableText(dto.description),
      status,
      priceMinor: minor(dto.price),
      version: integer(dto.version),
      components: rawComponents.map((item) => ({ sku: item.sku, productName: names.get(item.sku) ?? item.sku, quantity: item.quantity, regularUnitMinor: null, publicUnitMinor: null })),
      availability: await availability(id, status, signal),
    };
  }
  async function write(key: string, work: () => Promise<Combo>): Promise<Combo> {
    if (uncertain.has(key)) throw new Error("Hay una escritura de Combos sin confirmar. Consulta el recurso y reconcilia el resultado antes de crear otra operación.");
    try {
      const result = await work();
      uncertain.delete(key);
      return result;
    }
    catch (error) {
      if (!(error instanceof Error && /HTTP 4\d\d/.test(error.message))) uncertain.add(key);
      throw error;
    }
  }
  const toPayload = (payload: ComboPayload) => ({
    nombre: payload.name,
    descripcion: payload.description,
    componentes: payload.components.map(({ sku, quantity }) => ({ sku, cantidad: quantity })),
    precioCombo: payload.priceMinor / 100,
    ...(payload.version === undefined ? {} : { version: payload.version }),
  });
  return {
    async list(query: ComboQuery, signal): Promise<ComboPage> {
      const params = new URLSearchParams({ pagina: String(query.page), tamanio: String(query.pageSize) });
      if (query.status !== "TODOS") params.set("estado", query.status);
      const dto = object(await request(`/api/v1/combos?${params}`, "GET", signal));
      const meta = object(dto.meta);
      if (!Array.isArray(dto.items)) throw new Error("Combos no devolvió su lista de items.");
      const page = integer(meta.pagina, 1), pageSize = integer(meta.tamanio, 1), total = integer(meta.total);
      if (page !== query.page || pageSize !== query.pageSize) throw new Error("Combos devolvió una página distinta de la solicitada.");
      return { items: await Promise.all(dto.items.map((item) => mapCombo(item, signal))), page, pageSize, total };
    },
    async getById(id, signal) {
      let dto: unknown;
      try { dto = await request(`/api/v1/combos/${encodeURIComponent(id)}`, "GET", signal); }
      catch (error) { if (error instanceof Error && error.message.includes("HTTP 404")) return null; throw error; }
      return mapCombo(dto, signal);
    },
    create(payload) { return write("create", async () => mapCombo(await request("/api/v1/combos", "POST", undefined, toPayload(payload), 201))); },
    update(id, payload) { const key = `update:${id}`; return write(key, async () => mapCombo(await request(`/api/v1/combos/${encodeURIComponent(id)}`, "PATCH", undefined, toPayload(payload)))); },
    deactivate(id) { const key = `deactivate:${id}`; return write(key, async () => mapCombo(await request(`/api/v1/combos/${encodeURIComponent(id)}/desactivar`, "POST", undefined, {}))); },
  };
}
