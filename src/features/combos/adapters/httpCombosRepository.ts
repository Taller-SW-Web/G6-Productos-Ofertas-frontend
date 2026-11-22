import type { AuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { CombosRepository, Combo, ComboAvailability, ComboPayload, ComboPage, ComboQuery, CombosCatalogPort, ResolvedSku, PendingComboCreate } from "../types/combos";

type ComboAvailabilityDto = { informative_availability?: unknown; calculated_at?: unknown; freshness?: unknown };

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
function mapAvailability(dto: ComboAvailabilityDto, status: Combo["status"]): ComboAvailability {
  const quantity = dto.informative_availability === null || dto.informative_availability === undefined
    ? null
    : integer(dto.informative_availability);
  const calculatedAt = typeof dto.calculated_at === "string" && Number.isFinite(Date.parse(dto.calculated_at))
    ? dto.calculated_at : null;
  const freshness = dto.freshness === "ACTUALIZADA" || dto.freshness === "DESACTUALIZADA" || dto.freshness === "INCOMPLETA"
    ? dto.freshness : "NO_VERIFICABLE";
  const verifiable = status === "ACTIVO" && freshness === "ACTUALIZADA" && quantity !== null && calculatedAt !== null;
  const state = status === "INACTIVO" ? "COMBO_INACTIVO"
    : freshness === "DESACTUALIZADA" ? "DESACTUALIZADA"
      : !verifiable ? freshness === "INCOMPLETA" ? "INDETERMINADO" : "NO_VERIFICABLE"
        : quantity === 0 ? "NO_DISPONIBLE" : "DISPONIBLE";
  return {
    state,
    verifiable,
    quantity,
    freshness,
    calculatedAt,
    reason: state === "DISPONIBLE" ? null : state === "NO_DISPONIBLE" ? "La disponibilidad informativa confirmada es cero."
      : state === "COMBO_INACTIVO" ? "El combo está administrativamente inactivo."
        : "La API de Combos no ofrece una disponibilidad informativa verificable para este registro.",
  };
}

function mapContractAvailability(value: unknown, comboId: string, status: Combo["status"]): ComboAvailability {
  const dto = object(value);
  if (text(dto.comboId) !== comboId) throw new Error("Combos devolvió disponibilidad para otra identidad.");
  if (typeof dto.verificable !== "boolean") throw new Error("Combos devolvió un estado de disponibilidad inválido.");
  const freshness = dto.estadoActualizacion;
  if (freshness !== "ACTUALIZADA" && freshness !== "DESACTUALIZADA" && freshness !== "INCOMPLETA")
    throw new Error("Combos devolvió una actualización de disponibilidad desconocida.");
  const quantity = !Object.prototype.hasOwnProperty.call(dto, "cantidadInformativa") || dto.cantidadInformativa === null
    ? null : integer(dto.cantidadInformativa);
  if (dto.verificable && quantity === null) throw new Error("Combos marcó la disponibilidad como verificable sin informar una cantidad.");
  if (typeof dto.calculated_at !== "string" || !Number.isFinite(Date.parse(dto.calculated_at)))
    throw new Error("Combos devolvió una fecha de disponibilidad inválida.");
  const calculatedAt = dto.calculated_at;
  const verifiable = status === "ACTIVO" && dto.verificable && freshness === "ACTUALIZADA" && quantity !== null;
  const state: ComboAvailability["state"] = status === "INACTIVO" ? "COMBO_INACTIVO"
    : freshness === "DESACTUALIZADA" ? "DESACTUALIZADA"
      : !verifiable ? "INDETERMINADO"
        : quantity === 0 ? "NO_DISPONIBLE" : "DISPONIBLE";
  return {
    state,
    verifiable,
    quantity,
    freshness,
    calculatedAt,
    reason: state === "DISPONIBLE" ? null : state === "NO_DISPONIBLE" ? "La disponibilidad informativa confirmada es cero."
      : state === "COMBO_INACTIVO" ? "El combo está administrativamente inactivo."
        : state === "DESACTUALIZADA" ? "La última disponibilidad conocida está desactualizada."
          : "No hay información suficiente para determinar la disponibilidad del combo.",
  };
}

export function createHttpCombosRepository(client: AuthenticatedGatewayClient, catalog: CombosCatalogPort, scopeId: () => string | null): CombosRepository {
  const uncertaintyPrefix = "g6:combos:uncertain:v2:";
  const confirmedPrefix = "g6:combos:confirmed:create:";
  const storedUncertaintyKeys = () => { try { return typeof sessionStorage === "undefined" ? [] : Object.keys(sessionStorage).filter(key => key.startsWith(uncertaintyPrefix)).flatMap(key => { try { const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as { user?: string; intent?: string } | null; return value?.user === scopeId() && value.intent ? [`${value.user}:${value.intent}`] : []; } catch { return [`corrupt:${key}`]; } }); } catch { return ["storage-inaccessible"]; } };
  const uncertain = new Set<string>(storedUncertaintyKeys());
  const activeWrites = new Set<string>();
  const confirmedCreates = new Map<string, string>();
  try { if (typeof sessionStorage !== "undefined") for (const key of Object.keys(sessionStorage).filter(item => item.startsWith(confirmedPrefix))) { const id = sessionStorage.getItem(key); if (id) confirmedCreates.set(key.slice(confirmedPrefix.length), id); } } catch { /* storage is optional; runtime latches still apply */ }
  class UnconfirmedComboWrite extends Error {
    constructor(message: string, options?: ErrorOptions) { super(message, options); }
  }
  class ConfirmedComboWrite extends Error {}
  async function request(path: string, method: "GET" | "POST" | "PATCH", signal?: AbortSignal, body?: unknown, expected = 200, idempotencyKey?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await client.request(path, {
        method,
        signal,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }) },
        ...(body === undefined ? {} : { body: idempotencyKey === undefined ? JSON.stringify(body) : String(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (method === "GET") throw new Error("No se pudo conectar con Combos.", { cause: error });
      throw new UnconfirmedComboWrite(idempotencyKey
        ? "No se confirmó el alta. Vuelve a guardar con los mismos datos para recuperar el resultado con la misma clave."
        : "No se confirmó la escritura de Combos. Conserva la referencia y reconcilia el recurso antes de repetir la operación.", { cause: error });
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
  function mapCombo(value: unknown, resolved: ResolvedSku[] = []): Combo {
    const dto = object(value);
    const id = text(dto.combo_id);
    if (dto.status !== "ACTIVO" && dto.status !== "INACTIVO") throw new Error("Combos devolvió un estado desconocido.");
    if (!Array.isArray(dto.components) || dto.components.length < 2) throw new Error("Combos devolvió componentes incompletos.");
    const rawComponents = dto.components.map((item) => {
      const component = object(item);
      return { sku: text(component.sku), quantity: integer(component.quantity, 1) };
    });
    const names = new Map(resolved.map((item) => [item.sku, item.productName]));
    const status = dto.status;
    return {
      id,
      name: text(dto.name),
      description: nullableText(dto.description),
      status,
      priceMinor: minor(dto.price),
      version: integer(dto.version),
      components: rawComponents.map((item) => ({ sku: item.sku, productName: names.get(item.sku) ?? "Nombre no verificado", quantity: item.quantity, regularUnitMinor: null, publicUnitMinor: null })),
      availability: mapAvailability(dto as ComboAvailabilityDto, status),
    };
  }
  async function createFingerprint(userId: string, body: string): Promise<string> {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${body}`)));
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  async function write(key: string, work: (attempt?: { idempotencyKey: string; body: string }) => Promise<unknown>, create?: { owner: string; body: string }): Promise<unknown> {
    const userId = scopeId();
    if (!userId) throw new Error("Inicia sesión para modificar un combo.");
    const scopedIntent = `${userId}:${key}`;
    if (key.startsWith("create:") && confirmedCreates.has(key.slice("create:".length))) throw new Error(`Esta creación ya recibió confirmación HTTP para ${confirmedCreates.get(key.slice("create:".length))}. Abre ese recurso y reconcilia su presentación antes de iniciar otra creación idéntica.`);
    if (!create && uncertain.has(scopedIntent)) throw new Error("Esta intención de Combos requiere reconciliación. No se reenvió la mutación.");
    const createFingerprint = key.startsWith("create:") ? key.slice("create:".length) : null;
    const markerDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${key}`)))].map(value => value.toString(16).padStart(2, "0")).join("");
    const markerKey = `${uncertaintyPrefix}${markerDigest}`;
    if (scopeId() !== userId || (create && create.owner !== userId))
      throw new Error("La sesión cambió antes de enviar la escritura de Combos.");
    if (activeWrites.has(scopedIntent)) throw new Error("La intención de Combos ya está en curso.");
    let attempt: { idempotencyKey: string; body: string } | undefined;
    let replay = false;
    try {
      const old = sessionStorage.getItem(markerKey);
      if (old !== null) {
        const stored = object(JSON.parse(old));
        if (!create || stored.user !== userId || stored.intent !== key || stored.body !== create.body ||
          typeof stored.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/.test(stored.idempotencyKey))
          throw new Error("La intención previa carece de una clave y un cuerpo verificables.");
        attempt = { idempotencyKey: stored.idempotencyKey, body: create.body };
        replay = true;
      } else {
        if (uncertain.has(scopedIntent)) throw new Error("Falta la intención persistida.");
        if (create) attempt = { idempotencyKey: crypto.randomUUID(), body: create.body };
        sessionStorage.setItem(markerKey, JSON.stringify({ user: userId, intent: key, ...attempt }));
      }
    } catch (error) {
      throw new Error("No se pudo verificar o proteger la intención de Combos. No se envió la solicitud.", { cause: error });
    }
    uncertain.add(scopedIntent);
    activeWrites.add(scopedIntent);
    try {
      const result = await work(attempt);
      uncertain.delete(scopedIntent);
      try { sessionStorage.removeItem(markerKey); } catch { /* in-memory latch remains authoritative */ }
      if (scopeId() !== userId) throw new Error("Combos confirmó la escritura bajo la identidad original; no se presenta el resultado en la sesión actual.");
      return result;
    }
    catch (error) {
      if (!replay && !(error instanceof UnconfirmedComboWrite) && !(error instanceof ConfirmedComboWrite && createFingerprint) &&
        !(create && error instanceof Error && error.message.includes("IDEMPOTENCY_CONFLICT"))) {
        uncertain.delete(scopedIntent);
        try { sessionStorage.removeItem(markerKey); } catch { /* definitive 4xx; marker is only a guard */ }
      }
      throw error;
    } finally {
      activeWrites.delete(scopedIntent);
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
    try {
      const dto = object(value);
      const skus = Array.isArray(dto.components) ? dto.components.map(item => text(object(item).sku)) : [];
      let resolved: ResolvedSku[] = [];
      try { resolved = await catalog.resolveSkus(skus); } catch { /* explicit unverified name is safer than hiding the confirmed combo */ }
      return mapCombo(value, resolved);
    }
    catch (error) { throw new Error(`La escritura de Combos quedó confirmada para ${comboId}, pero falló el enriquecimiento o la disponibilidad. Consulta ese combo antes de cualquier otra acción. ${error instanceof Error ? error.message : "Error de presentación."}`, { cause: error }); }
  }
  async function presentConfirmedCreate(value: unknown, key: string): Promise<Combo> {
    const rawId = object(value).combo_id;
    if (typeof rawId !== "string" || !rawId.trim()) throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene un combo_id válido. La intención queda protegida para reconciliación; no la repitas.");
    const id = rawId; const fingerprint = key.slice("create:".length);
    confirmedCreates.set(fingerprint, id);
    try { if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(`${confirmedPrefix}${fingerprint}`) === null) sessionStorage.setItem(`${confirmedPrefix}${fingerprint}`, id); } catch { /* runtime latch retains the confirmed resource id */ }
    const result = await presentConfirmed(value);
    confirmedCreates.delete(fingerprint);
    try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`${confirmedPrefix}${fingerprint}`); } catch { /* current runtime already reconciled */ }
    return result;
  }
  function readPendingCreate(): PendingComboCreate | null {
    const userId = scopeId();
    if (!userId) throw new Error("Inicia sesión para consultar una creación pendiente.");
    let keys: string[];
    try { keys = typeof sessionStorage === "undefined" ? [] : Object.keys(sessionStorage).filter(key => key.startsWith(uncertaintyPrefix) || key.startsWith(confirmedPrefix)); }
    catch (error) { throw new Error("No se pudo verificar el almacenamiento de recuperación; creación bloqueada.", { cause: error }); }
    const records: PendingComboCreate[] = [];
    for (const storageKey of keys) {
      let stored: Record<string, unknown>;
      try { stored = object(JSON.parse(sessionStorage.getItem(storageKey) ?? "null")); }
      catch (error) { throw new Error("Hay un registro de creación pendiente corrupto. La creación está bloqueada para evitar duplicados.", { cause: error }); }
      if (storageKey.startsWith(confirmedPrefix)) {
        if (typeof stored.intent !== "string" || !stored.intent.startsWith("create:")) throw new Error("El registro de confirmación de creación está corrupto. La operación queda bloqueada.");
      } else if (typeof stored.intent !== "string" || !stored.intent.startsWith("create:")) continue;
      if (stored.user !== userId) throw new Error("Hay una creación pendiente asociada a otra identidad. Inicia sesión con esa identidad para recuperarla.");
      if (typeof stored.body !== "string" || typeof stored.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/.test(stored.idempotencyKey))
        throw new Error("El registro de creación pendiente está incompleto o corrupto. La operación queda bloqueada.");
      let body: Record<string, unknown>;
      try { body = object(JSON.parse(stored.body)); } catch (error) { throw new Error("El payload guardado de creación está corrupto. La operación queda bloqueada.", { cause: error }); }
      if (typeof body.nombre !== "string" || !Array.isArray(body.componentes)) throw new Error("El payload guardado de creación está incompleto o corrupto. La operación queda bloqueada.");
      const components = Array.isArray(body.componentes) ? body.componentes : [];
      const componentSkus = components.map(item => text(object(item).sku));
      const confirmedRaw = storageKey.startsWith(confirmedPrefix) ? JSON.stringify(stored) : sessionStorage.getItem(`${confirmedPrefix}${stored.intent.slice("create:".length)}`);
      let confirmedId: string | null = null;
      if (confirmedRaw) { try { const confirmedValue = object(JSON.parse(confirmedRaw)); confirmedId = confirmedValue.user === userId && confirmedValue.intent === stored.intent ? text(confirmedValue.comboId) : null; } catch { confirmedId = confirmedRaw; } }
      records.push({ name: body.nombre, componentSkus, body: stored.body, idempotencyKey: stored.idempotencyKey, comboId: typeof stored.comboId === "string" ? stored.comboId : confirmedId });
    }
    if (records.length > 1) throw new Error("Hay varias creaciones pendientes; la recuperación está bloqueada para evitar seleccionar una intención incorrecta.");
    return records[0] ?? null;
  }
  async function recoverPendingCreate(): Promise<Combo> {
    const pending = readPendingCreate();
    if (!pending) throw new Error("No hay una creación pendiente para recuperar.");
    if (pending.comboId) {
      const combo = await repository.getById(pending.comboId);
      if (!combo) throw new Error(`La creación ${pending.comboId} fue confirmada, pero el detalle aún no está disponible. Reintenta la conciliación.`);
      await clearPendingCreate(pending);
      return combo;
    }
    const userId = scopeId();
    const digest = await createFingerprint(userId!, pending.body);
    const intent = `create:${digest}`;
    const markerKey = `${uncertaintyPrefix}${[...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${intent}`)))].map(value => value.toString(16).padStart(2, "0")).join("")}`;
    const marker = object(JSON.parse(sessionStorage.getItem(markerKey) ?? "null"));
    if (marker.user !== userId || marker.intent !== intent || marker.body !== pending.body || marker.idempotencyKey !== pending.idempotencyKey)
      throw new Error("La creación pendiente cambió durante la recuperación. No se envió una solicitud.");
    if (scopeId() !== userId) throw new Error("La identidad cambió antes de conciliar la creación. No se envió una solicitud.");
    if (activeWrites.has(`${userId}:${intent}`)) throw new Error("La recuperación de esta creación ya está en curso.");
    activeWrites.add(`${userId}:${intent}`);
    try {
      const dto = await request("/api/v1/combos/administracion", "POST", undefined, pending.body, 201, pending.idempotencyKey);
      if (scopeId() !== userId) throw new Error("La identidad cambió durante la recuperación. La respuesta no se presenta en esta sesión.");
      const comboId = text(object(dto).combo_id);
      marker.comboId = comboId;
      sessionStorage.setItem(markerKey, JSON.stringify(marker));
      const result = await presentConfirmed(dto);
      await clearPendingCreate(pending);
      return result;
    } finally { activeWrites.delete(`${userId}:${intent}`); }
  }
  async function clearPendingCreate(pending: PendingComboCreate): Promise<void> {
    const userId = scopeId();
    if (!userId) return;
    const fingerprint = await createFingerprint(userId, pending.body);
    const intent = `create:${fingerprint}`;
    const markerDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\u0000${intent}`)))].map(value => value.toString(16).padStart(2, "0")).join("");
    uncertain.delete(`${userId}:${intent}`);
    try {
      sessionStorage.removeItem(`${uncertaintyPrefix}${markerDigest}`);
      sessionStorage.removeItem(`${confirmedPrefix}${fingerprint}`);
    } catch { /* local recovery metadata remains non-authoritative */ }
  }
  const repository: CombosRepository = {
    getPendingCreate: async () => readPendingCreate(),
    recoverPendingCreate,
    async list(query: ComboQuery, signal): Promise<ComboPage> {
      const params = new URLSearchParams({ pagina: String(query.page), tamanio: String(query.pageSize) });
      if (query.status !== "TODOS") params.set("estado", query.status);
      const dto = object(await request(`/api/v1/combos?${params}`, "GET", signal));
      const meta = object(dto.meta);
      if (!Array.isArray(dto.items)) throw new Error("Combos no devolvió su lista de items.");
      const rawItems: unknown[] = dto.items;
      const page = integer(meta.pagina, 1), pageSize = integer(meta.tamanio, 1), total = integer(meta.total);
      if (page !== query.page || pageSize !== query.pageSize) throw new Error("Combos devolvió una página distinta de la solicitada.");
      const skuGroups = rawItems.map(value => {
        const item = object(value);
        if (!Array.isArray(item.components)) throw new Error("Combos devolvió componentes incompletos.");
        return item.components.map(component => text(object(component).sku));
      });
      const skus = skuGroups.flat();
      let resolved: ResolvedSku[] = [];
      try { resolved = skus.length ? await catalog.resolveSkus(skus, signal) : []; } catch { /* fail closed: retain SKU identity, mark product name unverified */ }
      const items = rawItems.map(value => mapCombo(value, resolved));
      return { items, page, pageSize, total };
    },
    async getById(id, signal) {
      let dto: unknown;
      try { dto = await request(`/api/v1/combos/${encodeURIComponent(id)}`, "GET", signal); }
      catch (error) { if (error instanceof Error && error.message.includes("HTTP 404")) return null; throw error; }
      const value = object(dto);
      if (!Array.isArray(value.components)) throw new Error("Combos devolvió componentes incompletos.");
      const skus = value.components.map(component => text(object(component).sku));
      let resolved: ResolvedSku[] = [];
      try { resolved = await catalog.resolveSkus(skus, signal); } catch { /* explicit unverified product name below */ }
      return mapCombo(dto, resolved);
    },
    async readAvailability(comboId, status, signal) {
      const value = await request(`/api/v1/combos/${encodeURIComponent(comboId)}/disponibilidad`, "GET", signal);
      return mapContractAvailability(value, comboId, status);
    },
    async create(payload) {
      const owner = scopeId();
      if (!owner) throw new Error("Inicia sesión para crear un combo.");
      const body = JSON.stringify(toPayload(payload));
      const pending = readPendingCreate();
      if (pending?.comboId) throw new Error(`La creación ${pending.comboId} ya tiene identidad confirmada. Recupera su detalle antes de iniciar otra intención.`);
      if (pending && pending.body !== body) throw new Error("Hay una creación anterior pendiente. Recupera exactamente esa intención antes de iniciar otra; no se envió un nuevo POST.");
      const key = `create:${await createFingerprint(owner, body)}`;
      const otherUncertainCreate = [...uncertain].find((intent) => intent.startsWith(`${owner}:create:`) && intent !== `${owner}:${key}`);
      if (otherUncertainCreate) throw new Error("Hay una creación anterior con resultado incierto. Consulta/reconcilia esa intención antes de iniciar otra; no se envió un nuevo POST.");
      try {
        const legacyKey = `g6:combos:uncertain:create:${key.slice("create:".length)}`;
        if (sessionStorage.getItem(legacyKey) !== null) throw new Error("Existe una intención histórica sin propietario verificable; no se reenvía.");
      } catch (error) {
        if (error instanceof Error && error.message.includes("intención histórica")) throw error;
        throw new Error("No se pudo consultar la intención histórica de creación; operación bloqueada.", { cause: error });
      }
      const confirmed = await write(key, async attempt => {
        if (!attempt) throw new Error("Falta la clave de creación de Combos.");
        const dto = await request("/api/v1/combos/administracion", "POST", undefined, attempt.body, 201, attempt.idempotencyKey);
        let id: unknown;
        try { id = object(dto).combo_id; } catch { throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene una identidad reconciliable."); }
        if (typeof id !== "string" || !id.trim()) throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero el DTO no contiene un combo_id válido.");
        const fingerprint = key.slice("create:".length);
        confirmedCreates.set(fingerprint, id);
        try { sessionStorage.setItem(`${confirmedPrefix}${fingerprint}`, JSON.stringify({ user: owner, intent: key, body: attempt.body, idempotencyKey: attempt.idempotencyKey, comboId: id })); }
        catch { throw new ConfirmedComboWrite("Combos confirmó HTTP 201, pero no se pudo guardar la referencia de reconciliación."); }
        return dto;
      }, { owner, body });
      const result = await presentConfirmedCreate(confirmed, key);
      if (scopeId() !== owner) throw new Error("La sesión cambió durante la presentación del combo confirmado.");
      return result;
    },
    async update(id, payload) { const key = `update:${id}`; const confirmed = await write(key, () => request(`/api/v1/combos/${encodeURIComponent(id)}`, "PATCH", undefined, toPayload(payload))); return presentConfirmed(confirmed); },
    async deactivate(id) { const key = `deactivate:${id}`; const confirmed = await write(key, () => request(`/api/v1/combos/${encodeURIComponent(id)}/desactivar`, "POST", undefined, {}, 200)); return presentConfirmed(confirmed); },
  };
  return repository;
}
