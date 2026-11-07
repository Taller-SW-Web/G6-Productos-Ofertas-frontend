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

export function createHttpCombosRepository(client: AuthenticatedGatewayClient, catalog: CombosCatalogPort, scopeId: () => string | null): CombosRepository {
  const uncertaintyPrefix = "g6:combos:uncertain:v2:";
  const confirmedPrefix = "g6:combos:confirmed:create:";
  const storedUncertaintyKeys = () => { try { return typeof sessionStorage === "undefined" ? [] : Object.keys(sessionStorage).filter(key => key.startsWith(uncertaintyPrefix)).flatMap(key => { try { const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as { user?: string; intent?: string } | null; return value?.user === scopeId() && value.intent ? [`${value.user}:${value.intent}`] : []; } catch { return [`corrupt:${key}`]; } }); } catch { return ["storage-inaccessible"]; } };
  const uncertain = new Set<string>(storedUncertaintyKeys());
  const confirmedCreates = new Map<string, string>();
  try { if (typeof sessionStorage !== "undefined") for (const key of Object.keys(sessionStorage).filter(item => item.startsWith(confirmedPrefix))) { const id = sessionStorage.getItem(key); if (id) confirmedCreates.set(key.slice(confirmedPrefix.length), id); } } catch { /* storage is optional; runtime latches still apply */ }
  class UnconfirmedComboWrite extends Error {
    constructor(message: string, options?: ErrorOptions) { super(message, options); }
  }
  class ConfirmedComboWrite extends Error {}
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
      if (method === "GET") throw new Error("No se pudo conectar con Combos.", { cause: error });
      throw new UnconfirmedComboWrite("No se confirmó la escritura de Combos. Conserva la referencia y reconcilia el recurso antes de repetir la operación.", { cause: error });
    }
    if (!response.ok) {
      if (method !== "GET" && (response.status >= 500 || response.status === 408)) throw new UnconfirmedComboWrite(`Resultado de escritura incierto (HTTP ${response.status}); consulta Combos antes de crear otra operación.`);
      const bodyValue = await response.clone().json().catch(() => null) as { code?: unknown } | null;
      const code = typeof bodyValue?.code === "string" ? bodyValue.code : "ERROR_HTTP";
      throw new Error(`Combos respondió HTTP ${response.status} (${code}).`);
    }
    if (response.status !== expected) {
      if (method !== "GET") throw new UnconfirmedComboWrite(`Combos respondió HTTP ${response.status}, distinto del esperado ${expected}; reconcilia antes de reenviar.`);
      throw new Error("Combos devolvió una respuesta incompatible.");
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
      throw method === "GET" ? new Error("Combos devolvió una respuesta incompatible.") : new ConfirmedComboWrite("Combos confirmó la escritura, pero el MIME de respuesta es incompatible. No la repitas; consulta el recurso.");
    try { return await response.json(); }
    catch { throw method === "GET" ? new Error("Combos devolvió JSON ilegible.") : new ConfirmedComboWrite("Combos confirmó la escritura, pero su DTO es ilegible. No la repitas; consulta el recurso."); }
  }
  async function availability(id: string, status: Combo["status"], signal?: AbortSignal): Promise<ComboAvailability> {
    try { return mapAvailability(await request(`/api/v1/combos/${encodeURIComponent(id)}/disponibilidad`, "GET", signal), id, status); }
    catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof Error && /HTTP (401|403)/.test(error.message)) throw error;
      return { state: status === "INACTIVO" ? "COMBO_INACTIVO" : "NO_VERIFICABLE", verifiable: false, quantity: null,
        freshness: "NO_VERIFICABLE", calculatedAt: null,
        reason: `No se pudo consultar la disponibilidad auxiliar; el registro del combo sigue disponible. ${error instanceof Error ? error.message : "Error de consulta."}` };
    }
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
  async function createFingerprint(payload: ComboPayload): Promise<string> {
    const userId = scopeId();
    if (!userId) throw new Error("Inicia sesión para crear un combo.");
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${JSON.stringify(toPayload(payload))}`)));
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  async function write(key: string, work: () => Promise<unknown>): Promise<unknown> {
    const userId = scopeId();
    if (!userId) throw new Error("Inicia sesión para modificar un combo.");
    const scopedIntent = `${userId}:${key}`;
    if (key.startsWith("create:") && confirmedCreates.has(key.slice("create:".length))) throw new Error(`Esta creación ya recibió confirmación HTTP para ${confirmedCreates.get(key.slice("create:".length))}. Abre ese recurso y reconcilia su presentación antes de iniciar otra creación idéntica.`);
    if (uncertain.has(scopedIntent)) throw new Error("Esta intención de Combos requiere reconciliación. No se reenvió la mutación.");
    const createFingerprint = key.startsWith("create:") ? key.slice("create:".length) : null;
    const markerDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${key}`)))].map(value => value.toString(16).padStart(2, "0")).join("");
    const markerKey = `${uncertaintyPrefix}${markerDigest}`;
    // Persist the intent before dispatch. If storage is unavailable, fail closed
    // rather than risk an un-reconcilable duplicate after a reload.
    {
      try {
        if (typeof sessionStorage === "undefined") throw new Error("sessionStorage unavailable");
        const old = sessionStorage.getItem(markerKey);
        if (old !== null) {
          const parsed = JSON.parse(old) as { user?: string; intent?: string };
          if (parsed.user !== userId || parsed.intent !== key) throw new Error("Marcador de intención incompatible.");
          throw new Error("Esta intención ya está persistida y requiere conciliación.");
        }
        sessionStorage.setItem(markerKey, JSON.stringify({ user: userId, intent: key }));
      } catch {
        throw new Error("No se pudo proteger esta escritura frente a un resultado incierto; no se envió la solicitud.");
      }
      uncertain.add(scopedIntent);
    }
    try {
      const result = await work();
      uncertain.delete(scopedIntent);
      try { sessionStorage.removeItem(markerKey); } catch { /* in-memory latch remains authoritative */ }
      if (scopeId() !== userId) throw new Error("Combos confirmó la escritura bajo la identidad original; no se presenta el resultado en la sesión actual.");
      return result;
    }
    catch (error) {
      if (error instanceof UnconfirmedComboWrite) {
        uncertain.add(scopedIntent);
        try { sessionStorage.setItem(markerKey, JSON.stringify({ user: userId, intent: key })); } catch { /* marker was written before dispatch */ }
      } else if (error instanceof ConfirmedComboWrite && createFingerprint) {
        // A 201 was received but its DTO cannot supply the new ID. It is a
        // confirmed write that cannot be safely repeated; retain the same
        // per-intent reconciliation latch across reloads.
        uncertain.add(scopedIntent);
        try { sessionStorage.setItem(markerKey, JSON.stringify({ user: userId, intent: key })); } catch { /* marker was written before dispatch */ }
      } else {
        uncertain.delete(scopedIntent);
        try { sessionStorage.removeItem(markerKey); } catch { /* definitive 4xx; marker is only a guard */ }
      }
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
  async function presentConfirmed(value: unknown): Promise<Combo> {
    const comboId = text(object(value).combo_id);
    try { return await mapCombo(value); }
    catch (error) { throw new Error(`La escritura de Combos quedó confirmada para ${comboId}, pero falló el enriquecimiento o la disponibilidad. Consulta ese combo antes de cualquier otra acción. ${error instanceof Error ? error.message : "Error de presentación."}`, { cause: error }); }
  }
  async function presentConfirmedCreate(value: unknown, key: string): Promise<Combo> {
    const rawId = object(value).combo_id;
    if (typeof rawId !== "string" || !rawId.trim()) throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene un combo_id válido. La intención queda protegida para reconciliación; no la repitas.");
    const id = rawId; const fingerprint = key.slice("create:".length);
    confirmedCreates.set(fingerprint, id);
    try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(`${confirmedPrefix}${fingerprint}`, id); } catch { /* runtime latch retains the confirmed resource id */ }
    const result = await presentConfirmed(value);
    confirmedCreates.delete(fingerprint);
    try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`${confirmedPrefix}${fingerprint}`); } catch { /* current runtime already reconciled */ }
    return result;
  }
  return {
    async list(query: ComboQuery, signal): Promise<ComboPage> {
      const params = new URLSearchParams({ pagina: String(query.page), tamanio: String(query.pageSize) });
      if (query.status !== "TODOS") params.set("estado", query.status);
      const dto = object(await request(`/api/v1/combos?${params}`, "GET", signal));
      const meta = object(dto.meta);
      if (!Array.isArray(dto.items)) throw new Error("Combos no devolvió su lista de items.");
      const rawItems: unknown[] = dto.items;
      const page = integer(meta.pagina, 1), pageSize = integer(meta.tamanio, 1), total = integer(meta.total);
      if (page !== query.page || pageSize !== query.pageSize) throw new Error("Combos devolvió una página distinta de la solicitada.");
      const items: Combo[] = new Array(rawItems.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, rawItems.length) }, async () => {
        for (;;) {
          const index = next++;
          if (index >= rawItems.length) return;
          items[index] = await mapCombo(rawItems[index], signal);
        }
      }));
      return { items, page, pageSize, total };
    },
    async getById(id, signal) {
      let dto: unknown;
      try { dto = await request(`/api/v1/combos/${encodeURIComponent(id)}`, "GET", signal); }
      catch (error) { if (error instanceof Error && error.message.includes("HTTP 404")) return null; throw error; }
      return mapCombo(dto, signal);
    },
    async create(payload) {
      const key = `create:${await createFingerprint(payload)}`;
      try {
        const legacyKey = `g6:combos:uncertain:create:${key.slice("create:".length)}`;
        if (sessionStorage.getItem(legacyKey) !== null) throw new Error("Existe una intención histórica sin propietario verificable; no se reenvía.");
      } catch (error) {
        if (error instanceof Error && error.message.includes("intención histórica")) throw error;
        throw new Error("No se pudo consultar la intención histórica de creación; operación bloqueada.", { cause: error });
      }
      const confirmed = await write(key, async () => {
        const dto = await request("/api/v1/combos", "POST", undefined, toPayload(payload), 201);
        let id: unknown;
        try { id = object(dto).combo_id; } catch { throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene una identidad reconciliable."); }
        if (typeof id !== "string" || !id.trim()) throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene un combo_id válido.");
        const fingerprint = key.slice("create:".length);
        confirmedCreates.set(fingerprint, id);
        try { sessionStorage.setItem(`${confirmedPrefix}${fingerprint}`, id); }
        catch { throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero no se pudo guardar la referencia de reconciliación."); }
        return dto;
      });
      return presentConfirmedCreate(confirmed, key);
    },
    async update(id, payload) { const key = `update:${id}`; const confirmed = await write(key, () => request(`/api/v1/combos/${encodeURIComponent(id)}`, "PATCH", undefined, toPayload(payload))); return presentConfirmed(confirmed); },
    async deactivate(id) { const key = `deactivate:${id}`; const confirmed = await write(key, () => request(`/api/v1/combos/${encodeURIComponent(id)}/desactivar`, "POST", undefined, {}, 200)); return presentConfirmed(confirmed); },
  };
}
