import {
  PricingFailure,
  type BatchView,
  type PriceChange,
  type ScheduleDraft,
  type SchedulePage,
  type ScheduleView,
  type WriteTarget,
} from "../services/pricingModels";
import { localInstant } from "../services/pricingValidation";
import type {
  PriceChannel,
  ImportInput,
  PriceQuery,
  PriceTarget,
  PriceView,
  PricingRepository,
  ReportFile,
} from "../services/pricingRepository";
import {
  mapBatchDto,
  mapPriceDto,
  mapScheduleDto,
  mapSchedulePageDto,
  requestMoney,
  validatePriceTargets,
  type PricingChannelIds,
} from "./httpPricingMapper";

export interface PricingHttpRequest {
  method: "GET" | "PATCH" | "POST";
  signal: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  body?: string;
}

// Castilla adapts the shared API client to this narrow transport boundary.
export interface PricingHttpTransport {
  request(path: string, request: PricingHttpRequest): Promise<Response>;
}

export interface HttpPricingRepositoryDependencies {
  transport: PricingHttpTransport;
  scopeId?: () => string | null;
  listCatalogTargets?: (signal: AbortSignal) => Promise<PriceTarget[]>;
  canManagePricing?: () => boolean;
  channelIds?: PricingChannelIds;
  onUpdated?: (
    target: PriceTarget,
    before: PriceView,
    after: PriceView,
    reason: string,
  ) => void | Promise<void>;
}

const pageSize = 20;

type UpdateConfirmation = Pick<
  PriceView,
  "id" | "sku" | "version" | "regular" | "offer" | "currency" | "channel" | "origin"
> & { productId: string; owner: string; targetKind: PriceTarget["kind"]; channelId: string | null };

function confirmsUpdate(price: PriceView, expected: UpdateConfirmation): boolean {
  return (
    price.id === expected.id && price.sku === expected.sku &&
    price.version > expected.version &&
    sameMoney(price.regular, expected.regular) &&
    (price.offer === null || expected.offer === null ? price.offer === expected.offer : sameMoney(price.offer, expected.offer)) &&
    price.currency === expected.currency &&
    price.channel === expected.channel &&
    price.origin === expected.origin
  );
}

function sameMoney(left: string, right: string): boolean {
  try {
    const toCents = (value: string) => {
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
      const [whole = "0", fraction = ""] = value.split(".");
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    };
    const a = toCents(left), b = toCents(right);
    return a !== null && b !== null && a === b;
  } catch { return false; }
}

function blocked(message: string): PricingFailure {
  return new PricingFailure("blocked_contract", message);
}

function encoded(value: string): string {
  if (!value.trim()) {
    throw new PricingFailure(
      "error",
      "Pricing requiere un identificador válido.",
    );
  }
  return encodeURIComponent(value);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function problemCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    if (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).code === "string"
    )
      return (body as Record<string, string>).code;
  } catch {
    // The HTTP status still classifies the failure when the body is not a Problem document.
  }
  return undefined;
}

export function createHttpPricingRepository(
  dependencies: HttpPricingRepositoryDependencies,
): PricingRepository {
  const { transport } = dependencies;
  const channelIds = dependencies.channelIds ?? {};
  const editableReads = new Map<string, { productId: string; price: PriceView }>();
  const uncertainUpdates = new Map<string, UpdateConfirmation>();
  const uncertainSchedules = new Set<string>();
  const pendingWrites = new Set<string>();
  const markerPrefix = "g6:pricing:pending:v1:";
  const markerKey = (key: string, operation: "update" | "schedule") =>
    markerPrefix + operation + ":" + encodeURIComponent(key);
  const persistMarker = (key: string, operation: "update" | "schedule", expected: unknown) => {
    try { sessionStorage.setItem(markerKey(key, operation), JSON.stringify({ key, operation, expected, state: "IN_FLIGHT" })); }
    catch { throw new PricingFailure("unknown", "No se pudo persistir de forma segura la intención de Pricing; no se envió la escritura."); }
  };
  const setMarkerState = (key: string, operation: "update" | "schedule", state: "PENDING_RECONCILIATION" | "REQUIRES_EXTERNAL_VERIFICATION") => {
    try { const storageKey = markerKey(key, operation); const marker = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Record<string, unknown> | null; if (marker?.key === key && marker.operation === operation) sessionStorage.setItem(storageKey, JSON.stringify({ ...marker, state })); } catch { /* an unreadable marker remains fail-closed */ }
  };
  const readMarker = (key: string, operation: "update" | "schedule"):
    | { state: "absent" }
    | { state: "valid"; expected: UpdateConfirmation | Record<string, unknown> }
    | { state: "corrupt" | "inaccessible" } => {
    let raw: string | null;
    try { raw = sessionStorage.getItem(markerKey(key, operation)); }
    catch { return { state: "inaccessible" }; }
    if (raw === null) return { state: "absent" };
    try {
      const marker = JSON.parse(raw) as { key?: unknown; operation?: unknown; expected?: unknown; state?: unknown };
      if (marker.key !== key || marker.operation !== operation || !marker.expected || typeof marker.expected !== "object" || !["IN_FLIGHT", "PENDING_RECONCILIATION", "REQUIRES_EXTERNAL_VERIFICATION"].includes(String(marker.state))) return { state: "corrupt" };
      const expected = marker.expected as Record<string, unknown>;
      if (operation === "update" && (typeof expected.productId !== "string" || typeof expected.id !== "string" || typeof expected.owner !== "string" || expected.owner !== (dependencies.scopeId?.() ?? "session-unavailable") || (expected.targetKind !== "product" && expected.targetKind !== "variant") || !(typeof expected.channelId === "string" || expected.channelId === null) || typeof expected.version !== "number" || typeof expected.regular !== "string" || ![null, "string"].includes(typeof expected.offer) && expected.offer !== null || typeof expected.currency !== "string" || typeof expected.channel !== "string" || typeof expected.origin !== "string" || (expected.sku !== undefined && typeof expected.sku !== "string"))) return { state: "corrupt" };
      if (operation === "schedule" && (typeof expected.owner !== "string" || expected.owner !== (dependencies.scopeId?.() ?? "session-unavailable") || typeof expected.targetId !== "string" || (expected.targetKind !== "product" && expected.targetKind !== "variant") || !(typeof expected.channelId === "string" || expected.channelId === null) || typeof expected.channel !== "string" || typeof expected.kind !== "string" || typeof expected.amount !== "string" || typeof expected.currency !== "string" || typeof expected.start !== "number" || !(typeof expected.end === "number" || expected.end === null) || !Array.isArray(expected.baselineIds) || expected.baselineIds.some(id => typeof id !== "string"))) return { state: "corrupt" };
      return { state: "valid", expected: expected as UpdateConfirmation | Record<string, unknown> };
    } catch { return { state: "corrupt" }; }
  };
  const clearMarker = (key: string, operation: "update" | "schedule") => { try { sessionStorage.removeItem(markerKey(key, operation)); } catch { /* uncertain marker remains fail-closed */ } };

  function scopeKey(target: PriceTarget, channel: PriceChannel, owner = dependencies.scopeId?.() ?? "session-unavailable"): string {
    return `${targetPath(target)}:${channel}:${encodeURIComponent(owner)}`;
  }

  function uncertainUpdate(key: string): UpdateConfirmation | undefined {
    const value = uncertainUpdates.get(key);
    if (value) return value;
    const marker = readMarker(key, "update");
    if (marker.state === "absent") return undefined;
    if (marker.state !== "valid") throw new PricingFailure("unknown", "El marcador de una escritura previa está corrupto o inaccesible; se bloquea el reenvío por seguridad.");
    uncertainUpdates.set(key, marker.expected as UpdateConfirmation);
    return marker.expected as UpdateConfirmation;
  }
  function hasUncertainSchedule(key: string): boolean {
    if (uncertainSchedules.has(key)) return true;
    const marker = readMarker(key, "schedule");
    if (marker.state !== "absent") uncertainSchedules.add(key);
    return marker.state !== "absent";
  }

  async function catalogTargets(signal: AbortSignal): Promise<PriceTarget[]> {
    signal.throwIfAborted();
    if (!dependencies.listCatalogTargets) {
      throw blocked(
        "La selección de Pricing requiere objetivos y elegibilidad publicados por el provider de Catálogo. Esa integración aún no está configurada.",
      );
    }
    try {
      return validatePriceTargets(
        await dependencies.listCatalogTargets(signal),
      );
    } catch (error) {
      if (signal.aborted || isAbort(error) || error instanceof PricingFailure)
        throw error;
      throw new PricingFailure(
        "error",
        "No se pudo verificar la selección autoritativa de Catálogo.",
      );
    }
  }

  async function targetById(
    targetId: string,
    signal: AbortSignal,
  ): Promise<PriceTarget> {
    const targets = await catalogTargets(signal);
    const target = targets.find((item) => item.id === targetId);
    if (!target) {
      throw new PricingFailure(
        "error",
        "El objetivo ya no está disponible en Catálogo. Vuelve a consultar la selección.",
      );
    }
    return target;
  }

  function targetPath(target: PriceTarget, suffix = ""): string {
    return target.kind === "product"
      ? `/api/v1/precios/productos/${encoded(target.productId)}${suffix}`
      : `/api/v1/precios/skus/${encoded(target.sku)}${suffix}`;
  }

  function channelIdFor(channel: PriceChannel): string | null {
    if (channel === "global") return null;
    if (channelIds[channel]) return channelIds[channel];
    throw blocked(
      `El contrato de escritura requiere el channelId canónico de ${channel.toUpperCase()}; Catálogo/Integración todavía no lo proporciona.`,
    );
  }

  async function send(
    path: string,
    request: PricingHttpRequest,
    write: boolean,
    absentCodes: readonly string[] = [],
  ): Promise<Response | null> {
    request.signal.throwIfAborted();
    let response: Response;
    try {
      response = await transport.request(path, request);
    } catch (error) {
      if (!write && (request.signal.aborted || isAbort(error))) throw error;
      if (!write && error instanceof PricingFailure) throw error;
      throw new PricingFailure(
        write ? "unknown" : "error",
        write
          ? "No se confirmó el resultado de Pricing. Consulta el estado antes de intentar otra vez."
          : "Pricing no respondió a la consulta.",
      );
    }
    if (response.ok) {
      const expected = request.method === "POST" ? 201 : 200;
      if (response.status !== expected) {
        throw new PricingFailure(
          write ? "unknown" : "error",
          "Pricing no devolvió la confirmación HTTP prevista por el contrato.",
        );
      }
      return response;
    }

    const code = await problemCode(response);
    if (response.status === 404 && code && absentCodes.includes(code))
      return null;
    const kind =
      response.status === 401
        ? "unauthorized"
        : response.status === 403
          ? "forbidden"
          : response.status === 409
            ? code === "VIGENCIA_SUPERPUESTA"
              ? "overlap"
              : "conflict"
            : write && response.status >= 500
              ? "unknown"
              : "error";
    const message =
      response.status === 401
        ? "Pricing rechazó la autorización."
        : response.status === 403
          ? "Tu rol no permite esta operación de Pricing."
          : response.status === 409
            ? code === "VIGENCIA_SUPERPUESTA"
              ? "La vigencia se superpone con otra del mismo objetivo y canal."
              : "El precio cambió desde la lectura. Conserva la propuesta y vuelve a consultar."
            : write && response.status >= 500
              ? "Pricing no confirmó el resultado. Consulta el estado antes de intentar otra vez."
              : response.status === 400 || response.status === 422
                ? "Pricing rechazó los datos enviados. Revisa el formulario."
                : "Pricing no pudo completar la operación.";
    throw new PricingFailure(kind, message);
  }

  async function json(
    path: string,
    request: PricingHttpRequest,
    write: boolean,
    absentCodes: readonly string[] = [],
  ): Promise<unknown | null> {
    const response = await send(path, request, write, absentCodes);
    if (!response) return null;
    try {
      const body: unknown = await response.json();
      if (body === null) throw new Error("Respuesta sin DTO");
      return body;
    } catch {
      throw new PricingFailure(
        write ? "unknown" : "error",
        write
          ? "Pricing pudo confirmar el cambio, pero la respuesta no se pudo validar. Consulta el precio antes de reintentar."
          : "Pricing devolvió una respuesta ilegible.",
      );
    }
  }

  async function readAllSchedules(target: PriceTarget, signal: AbortSignal): Promise<ScheduleView[]> {
    const first = await json(targetPath(target, `/programaciones?pagina=1&tamanio=${pageSize}`), { method: "GET", signal }, false);
    if (first === null) throw new PricingFailure("unknown", "No se pudo capturar la línea base de programaciones.");
    const initial = mapSchedulePageDto(first, target, 1, pageSize, channelIds);
    const pages = Math.ceil(initial.total / pageSize);
    if (pages > 1000) throw new PricingFailure("unknown", "La línea base supera el límite de paginación; no se envía la programación sin evidencia reconciliable.");
    const items = [...initial.items];
    for (let page = 2; page <= pages; page++) {
      const value = await json(targetPath(target, `/programaciones?pagina=${page}&tamanio=${pageSize}`), { method: "GET", signal }, false);
      if (value === null) throw new PricingFailure("unknown", "La línea base quedó incompleta; no se envía la programación.");
      const mapped = mapSchedulePageDto(value, target, page, pageSize, channelIds);
      if (mapped.total !== initial.total) throw new PricingFailure("unknown", "El total cambió al capturar la línea base; no se envía la programación.");
      items.push(...mapped.items);
    }
    if (items.length !== initial.total) throw new PricingFailure("unknown", "La paginación de línea base está incompleta; no se envía la programación.");
    return items;
  }

  async function readTarget(
    target: PriceTarget,
    channel: PriceChannel,
    signal: AbortSignal,
  ): Promise<PriceView | null> {
    if (target.kind === "product" && channel !== "global") {
      throw blocked(
        "El GET administrativo de producto no resuelve canal Retail. Se requiere un SKU legítimo o una operación contractual que confirme ese alcance.",
      );
    }
    const suffix = target.kind === "variant" && channel !== "global" ? `?canal=${channel.toUpperCase()}` : "";
    const response = await json(
      targetPath(target, suffix),
      { method: "GET", signal },
      false,
      ["PRECIO_NO_ENCONTRADO"],
    );
    if (response === null) return null;
    const price = mapPriceDto(response, target, channelIds);
    if (channel === "global" && price.channel !== "global") {
      throw new PricingFailure(
        "error",
        "Pricing devolvió un precio de otro canal.",
      );
    }
    return price;
  }

  return {
    async listTargets(signal) {
      return catalogTargets(signal);
    },

    async read(query: PriceQuery, signal) {
      const target = await targetById(query.targetId, signal);
      const price = await readTarget(target, query.channel, signal);
      return price ? { price, breakdown: [] } : null;
    },

    async readEditable(writeTarget: WriteTarget, signal) {
      const owner = dependencies.scopeId?.() ?? "session-unavailable";
      const target = await targetById(writeTarget.targetId, signal);
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió durante la lectura de Pricing.");
      const key = scopeKey(target, writeTarget.channel, owner);
      if (pendingWrites.has("update:" + key)) {
        throw new PricingFailure(
          "unknown",
          "Hay un cambio pendiente de confirmación. Espera su resultado antes de volver a leer para editar.",
        );
      }
      editableReads.delete(key);
      if (target.kind === "product" && writeTarget.channel !== "global") {
        throw blocked(
          "GET de precio de producto no admite canal. No es posible leer la versión exacta de un precio Retail para editarlo.",
        );
      }
      const price = await readTarget(target, writeTarget.channel, signal);
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió durante la lectura de precio; no se reconcilia el propietario anterior.");
      if (
        target.kind === "variant" &&
        price &&
        (price.inherited ||
          price.origin !== "sku" ||
          price.channel !== writeTarget.channel)
      ) {
        throw blocked(
          "El precio consultado es heredado o corresponde a otro canal. Pricing no confirmó una definición propia para editar este alcance.",
        );
      }
      const uncertain = uncertainUpdate(key);
      if (uncertain) {
        if (
          !price ||
          uncertain.productId !== target.productId ||
          !confirmsUpdate(price, uncertain)
        ) {
          setMarkerState(key, "update", "REQUIRES_EXTERNAL_VERIFICATION");
          throw new PricingFailure(
            "unknown",
            "El cambio sigue pendiente de verificación. La lectura no confirma una versión superior con los valores solicitados; no se permite reenviarlo.",
          );
        }
        uncertainUpdates.delete(key);
        clearMarker(key, "update");
      }
      if (price) {
        editableReads.set(key, { productId: target.productId, price });
      }
      return price;
    },

    async update(change: PriceChange, signal) {
      const owner = dependencies.scopeId?.() ?? "session-unavailable";
      if (dependencies.canManagePricing && !dependencies.canManagePricing())
        throw new PricingFailure("forbidden", "Tu cuenta no tiene el rol GESTOR_COMERCIAL requerido para modificar precios.");
      const target = await targetById(change.target.targetId, signal);
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió antes de despachar el cambio de precio.");
      const key = scopeKey(target, change.target.channel, owner);
      if (uncertainUpdate(key)) {
        throw new PricingFailure(
          "unknown",
          "El resultado anterior sigue pendiente de verificación. Releer solo desbloquea este alcance si Pricing confirma una versión superior con los valores solicitados.",
        );
      }
      const snapshot = editableReads.get(key);
      const before =
        snapshot?.productId === target.productId ? snapshot.price : undefined;
      if (!before || before.version !== change.version) {
        throw new PricingFailure(
          "conflict",
          "Vuelve a leer el precio exacto de este objetivo y canal antes de guardar.",
        );
      }
      if (target.kind === "product" && change.target.channel !== "global") {
        throw blocked(
          "No existe una lectura contractual de precio de producto por canal para verificar la versión antes de editar Retail.",
        );
      }
      if (!Number.isSafeInteger(change.version) || change.version < 1) {
        throw new PricingFailure("error", "La versión de precio no es válida.");
      }
      const body: {
        precioRegular: number;
        precioOferta?: number | null;
        accionPrecioOferta: PriceChange["draft"]["offerAction"];
        moneda: string;
        motivoCambio: string;
        priceVersion: number;
        channelId: string | null;
      } = {
        precioRegular: requestMoney(change.draft.regular),
        accionPrecioOferta: change.draft.offerAction,
        moneda: change.draft.currency,
        motivoCambio: change.draft.reason,
        priceVersion: change.version,
        channelId: channelIdFor(change.target.channel),
      };
      if (change.draft.offerAction === "ESTABLECER")
        body.precioOferta = requestMoney(change.draft.offer);
      if (change.draft.offerAction === "ELIMINAR") body.precioOferta = null;
      const expected: UpdateConfirmation = {
        id: target.id,
        sku: target.kind === "variant" ? target.sku : target.referenceSku,
        productId: target.productId,
        owner,
        targetKind: target.kind,
        channelId: body.channelId,
        version: before.version,
        regular: String(body.precioRegular),
        offer:
          change.draft.offerAction === "CONSERVAR"
            ? before.offer
            : change.draft.offerAction === "ELIMINAR"
              ? null
              : String(body.precioOferta),
        currency: body.moneda,
        channel: change.target.channel,
        origin: target.kind === "variant" ? "sku" : "product",
      };
      const pendingKey = "update:" + key;
      if (pendingWrites.has(pendingKey)) {
        throw new PricingFailure(
          "unknown",
          "Hay un cambio pendiente de confirmación para este objetivo y canal.",
        );
      }
      persistMarker(key, "update", expected);
      pendingWrites.add(pendingKey);
      try {
        const response = await json(
          targetPath(target),
          {
            method: "PATCH",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
          true,
        );
        let after: PriceView;
        try {
          after = mapPriceDto(response, target, channelIds);
          if (!confirmsUpdate(after, expected)) {
            throw new Error("Confirmación incompatible");
          }
        } catch {
          throw new PricingFailure(
            "unknown",
            "La respuesta no confirma el cambio solicitado. Consulta el precio antes de reintentar.",
          );
        }
        editableReads.set(key, { productId: target.productId, price: after });
        if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "El cambio fue confirmado bajo la identidad original; no se presenta en la sesión actual.");
        clearMarker(key, "update");
        uncertainUpdates.delete(key);
        try {
          await dependencies.onUpdated?.(
            target,
            before,
            after,
            change.draft.reason,
          );
        } catch {
          console.warn(
            "No se registró la auditoría de demostración tras confirmar el precio.",
          );
        }
        return after;
      } catch (error) {
        if (error instanceof PricingFailure && error.kind === "unknown") {
          uncertainUpdates.set(key, expected);
          setMarkerState(key, "update", "PENDING_RECONCILIATION");
        } else clearMarker(key, "update");
        throw error;
      } finally {
        pendingWrites.delete(pendingKey);
      }
    },

    async listSchedules(targetId, page, signal): Promise<SchedulePage> {
      const owner = dependencies.scopeId?.() ?? "session-unavailable";
      const assertOwner = () => {
        if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner)
          throw new PricingFailure("unknown", "La sesión cambió durante la lectura de programaciones; la respuesta y la conciliación se descartan.");
      };
      if (!Number.isSafeInteger(page) || page < 1) {
        throw new PricingFailure("error", "La página solicitada no es válida.");
      }
      let target: PriceTarget;
      try { target = await targetById(targetId, signal); }
      catch (error) { assertOwner(); throw error; }
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió durante la lectura de programaciones.");
      const suffix = `/programaciones?pagina=${page}&tamanio=${pageSize}`;
      let response: unknown;
      try { response = await json(targetPath(target, suffix), { method: "GET", signal }, false); }
      catch (error) { assertOwner(); throw error; }
      assertOwner();
      if (response === null) {
        throw new PricingFailure(
          "error",
          "Pricing no devolvió las programaciones.",
        );
      }
      const result = mapSchedulePageDto(response, target, page, pageSize, channelIds);
      assertOwner();
      const scopeSuffix = `:${encodeURIComponent(owner)}`;
      const targetPrefix = `${targetPath(target)}:`;
      let needsReconciliation = [...uncertainSchedules].some(key => key.startsWith(targetPrefix) && key.endsWith(scopeSuffix));
      try {
        const scopePrefix = markerPrefix + "schedule:";
        for (const storageKey of Object.keys(sessionStorage).filter(item => item.startsWith(scopePrefix))) {
          let storedIntent: string;
          try { storedIntent = decodeURIComponent(storageKey.slice(scopePrefix.length)); } catch { continue; }
          if (!storedIntent.startsWith(targetPrefix) || !storedIntent.endsWith(scopeSuffix)) continue;
          const entry = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { key?: string; operation?: string; expected?: unknown } | null;
          if (!entry || entry.operation !== "schedule" || !entry.key || !entry.expected || entry.key !== storedIntent) throw new Error("Corrupt pricing marker");
          uncertainSchedules.add(entry.key);
          needsReconciliation = true;
        }
      } catch { throw new PricingFailure("unknown", "Hay un marcador de programación ilegible o inaccesible; no se libera ninguna intención."); }
      if (!needsReconciliation) { assertOwner(); return result; }
      const allSchedules = [...result.items];
      const pages = Math.ceil(result.total / pageSize);
      if (pages > 1000) throw new PricingFailure("unknown", "La paginación excede el límite defensivo; no se liberan intenciones de programación.");
      for (let current = 1; current <= pages; current++) {
        if (current === page) continue;
        let pageValue: unknown;
        try { pageValue = await json(targetPath(target, `/programaciones?pagina=${current}&tamanio=${pageSize}`), { method: "GET", signal }, false); }
        catch (error) { assertOwner(); throw error; }
        assertOwner();
        if (pageValue === null) throw new PricingFailure("unknown", "La lectura paginada quedó incompleta; se conservan los bloqueos.");
        const mapped = mapSchedulePageDto(pageValue, target, current, pageSize, channelIds);
        assertOwner();
        if (mapped.total !== result.total) throw new PricingFailure("unknown", "El total cambió durante la reconciliación; se conservan los bloqueos.");
        allSchedules.push(...mapped.items);
      }
      assertOwner();
      for (const key of [...uncertainSchedules]) {
        assertOwner();
        if (!key.startsWith(targetPrefix) || !key.endsWith(scopeSuffix)) continue;
        const marker = readMarker(key, "schedule");
        if (marker.state === "absent") continue;
        if (marker.state !== "valid") throw new PricingFailure("unknown", "Una intención de programación está corrupta o inaccesible; no se permite reenviar.");
        const expected = marker.expected as Record<string, unknown>;
        const expectedChannel = expected.channel as PriceChannel;
        const expectedChannelId = expectedChannel === "global" ? null : channelIds[expectedChannel as Exclude<PriceChannel, "global">];
        if (expected.channelId !== expectedChannelId) throw new PricingFailure("unknown", "La identidad canónica del canal cambió o falta; no se libera la programación incierta.");
        const matches = allSchedules.filter(item => {
          const value = expected;
          return item.targetId === value.targetId && item.channel === value.channel && item.kind === value.kind && sameMoney(item.amount, String(value.amount)) && item.currency === value.currency && Date.parse(item.start) === value.start && (item.end === null ? null : Date.parse(item.end)) === value.end;
        });
        const baselineIds = expected.baselineIds as string[];
        const newMatches = matches.filter(item => !baselineIds.includes(item.id));
        if (newMatches.length === 1) { clearMarker(key, "schedule"); uncertainSchedules.delete(key); }
        else setMarkerState(key, "schedule", "REQUIRES_EXTERNAL_VERIFICATION");
      }
      assertOwner();
      return result;
    },

    async schedule(
      targetId,
      draft: ScheduleDraft,
      signal,
    ): Promise<ScheduleView> {
      if (dependencies.canManagePricing && !dependencies.canManagePricing())
        throw new PricingFailure("forbidden", "Tu cuenta no tiene el rol GESTOR_COMERCIAL requerido para programar precios.");
      const owner = dependencies.scopeId?.() ?? "session-unavailable";
      const target = await targetById(targetId, signal);
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió antes de despachar la programación.");
      const validFrom = localInstant(draft.start);
      const validUntil = draft.end ? localInstant(draft.end) : null;
      if (!validFrom || (draft.end && !validUntil)) {
        throw new PricingFailure(
          "error",
          "La vigencia no contiene una fecha válida.",
        );
      }
      const body = {
        tipoPrecio: draft.kind,
        importe: requestMoney(draft.amount),
        moneda: draft.currency,
        channelId: channelIdFor(draft.channel),
        validFrom,
        validUntil,
        motivoCambio: draft.reason,
      };
      const key = scopeKey(target, draft.channel, owner);
      const pendingKey = "schedule:" + key;
      if (hasUncertainSchedule(key) || pendingWrites.has(pendingKey)) {
        throw new PricingFailure(
          "unknown",
          "Hay una programación pendiente de verificación. Consulta las programaciones antes de realizar otra escritura.",
        );
      }
      const baselineSchedules = await readAllSchedules(target, signal);
      if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La sesión cambió al capturar la línea base; no se envió la programación.");
      const expectedSchedule = { owner, targetId: target.id, targetKind: target.kind, channelId: body.channelId, channel: draft.channel, kind: draft.kind, amount: String(body.importe), currency: draft.currency, start: Date.parse(body.validFrom), end: validUntil === null ? null : Date.parse(validUntil), baselineIds: baselineSchedules.filter(item => item.targetId === target.id && item.channel === draft.channel && item.kind === draft.kind && sameMoney(item.amount, String(body.importe)) && item.currency === draft.currency && Date.parse(item.start) === Date.parse(body.validFrom) && (item.end === null ? null : Date.parse(item.end)) === (validUntil === null ? null : Date.parse(validUntil))).map(item => item.id) };
      persistMarker(key, "schedule", expectedSchedule);
      pendingWrites.add(pendingKey);
      try {
        const response = await json(
          targetPath(target, "/programaciones"),
          {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
          true,
        );
        try {
          const created = mapScheduleDto(response, target, channelIds);
          if (
            created.channel !== draft.channel ||
            created.currency !== draft.currency ||
            created.kind !== draft.kind ||
            created.amount !== String(body.importe) ||
            Date.parse(created.start) !== Date.parse(body.validFrom) ||
            (created.end === null ? null : Date.parse(created.end)) !==
              (validUntil === null ? null : Date.parse(validUntil))
          ) {
            throw new Error("Confirmación incompatible");
          }
          if ((dependencies.scopeId?.() ?? "session-unavailable") !== owner) throw new PricingFailure("unknown", "La programación fue confirmada bajo la identidad original; no se presenta en la sesión actual.");
          clearMarker(key, "schedule"); uncertainSchedules.delete(key);
          return created;
        } catch {
          throw new PricingFailure(
            "unknown",
            "La respuesta no confirma la programación. Consulta su estado antes de reintentar.",
          );
        }
      } catch (error) {
        if (error instanceof PricingFailure && error.kind === "unknown") {
          uncertainSchedules.add(key);
          setMarkerState(key, "schedule", "PENDING_RECONCILIATION");
        } else clearMarker(key, "schedule");
        throw error;
      } finally {
        pendingWrites.delete(pendingKey);
      }
    },

    async readHistorical(query, at, signal) {
      const target = await targetById(query.targetId, signal);
      const sku = target.kind === "variant" ? target.sku : target.referenceSku;
      if (!sku) {
        throw blocked(
          "El histórico requiere un SKU vendible resuelto por Catálogo para este objetivo.",
        );
      }
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          at,
        ) ||
        !Number.isFinite(Date.parse(at))
      ) {
        throw new PricingFailure(
          "error",
          "El instante histórico no es válido.",
        );
      }
      const params = new URLSearchParams({ at });
      if (query.channel !== "global") params.set("canal", query.channel.toUpperCase());
      const response = await json(
        `/api/v1/precios/skus/${encoded(sku)}?${params.toString()}`,
        { method: "GET", signal },
        false,
        ["PRECIO_NO_ENCONTRADO"],
      );
      if (response === null) return null;
      const price = mapPriceDto(response, target, channelIds, sku);
      const instant = Date.parse(at);
      if (
        (query.channel === "global" && price.channel !== "global") ||
        instant < Date.parse(price.validFrom) ||
        (price.validUntil !== null && instant >= Date.parse(price.validUntil))
      ) {
        throw new PricingFailure(
          "error",
          "Pricing devolvió una vigencia o canal que no corresponde a la consulta histórica.",
        );
      }
      if (!price.validityId) {
        throw new PricingFailure(
          "error",
          "Pricing no devolvió el identificador de la vigencia histórica.",
        );
      }
      return { price, validityId: price.validityId };
    },

    async prevalidate(input: ImportInput, signal) {
      void input;
      signal.throwIfAborted();
      throw blocked(
        "La prevalidación real de importaciones permanece bloqueada por P-PRI-01. No se envió ni se simuló el análisis del archivo.",
      );
    },

    async readBatch(id, signal): Promise<BatchView | null> {
      const response = await json(
        `/api/v1/precios/importaciones/${encoded(id)}`,
        { method: "GET", signal },
        false,
        ["LOTE_NO_ENCONTRADO"],
      );
      if (response === null) return null;
      const batch = mapBatchDto(response);
      if (batch.id !== id)
        throw new PricingFailure(
          "error",
          "Pricing devolvió un lote distinto del solicitado.",
        );
      return batch;
    },

    async report(id, signal): Promise<ReportFile> {
      const response = await send(
        `/api/v1/precios/importaciones/${encoded(id)}/reporte`,
        { method: "GET", signal },
        false,
      );
      if (!response) {
        throw new PricingFailure(
          "error",
          "Pricing no devolvió el reporte solicitado.",
        );
      }
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("text/csv")
      ) {
        throw new PricingFailure(
          "error",
          "Pricing devolvió un formato de reporte distinto al CSV publicado.",
        );
      }
      try {
        return { data: await response.blob(), filename: "reporte-precios.csv" };
      } catch {
        throw new PricingFailure(
          "error",
          "No se pudo leer el reporte de Pricing.",
        );
      }
    },
  };
}
