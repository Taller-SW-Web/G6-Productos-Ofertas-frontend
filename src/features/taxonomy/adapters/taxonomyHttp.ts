import type { TaxonomyGatewayTransport } from "./httpProductTypeAdapter";

export type TaxonomyWriteOutcome = "rejected" | "unknown" | "confirmed_unreadable" | "confirmed_mapped" | "confirmed_read_failed";
export type TaxonomyMutationResult<T> = { outcome: "confirmed_mapped"; value: T };

export class TaxonomyMutationError extends Error {
  constructor(readonly outcome: TaxonomyWriteOutcome, message: string, readonly intentKey?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaxonomyMutationError";
  }
}

export class TaxonomyHttpError extends TaxonomyMutationError {
  constructor(readonly status: number, readonly code?: string, message?: string) {
    super("rejected", message ?? `Taxonomía respondió HTTP ${status}${code ? ` (${code})` : ""}.`);
    this.name = "TaxonomyHttpError";
  }
}
export function isUncertainTaxonomyMutation(error: unknown): error is TaxonomyMutationError {
  return error instanceof TaxonomyMutationError && error.outcome !== "rejected";
}

const prefix = "g6:taxonomy:pending:";
const maxPending = 96;
async function jsonBody(body: unknown): Promise<string> {
  if (body instanceof FormData) return JSON.stringify(await Promise.all([...body.entries()].filter(([key]) => key !== "version" && key !== "schemaVersion").map(async ([key, value]) => [key,
    value instanceof File ? { name: value.name, size: value.size, type: value.type, digest: [...new Uint8Array(await crypto.subtle.digest("SHA-256", await value.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("") } : value])));
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "version" && key !== "schemaVersion").map(([key, child]) => [key, normalize(child)]));
    return value;
  };
  return JSON.stringify(normalize(body ?? null));
}
async function persistentBody(body: unknown): Promise<unknown> {
  if (!(body instanceof FormData)) return body ?? null;
  const fields: Record<string, string> = {};
  const files: { field: string; name: string; size: number; type: string; digest: string }[] = [];
  for (const [field, value] of body.entries()) {
    if (value instanceof File) {
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await value.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      files.push({ field, name: value.name, size: value.size, type: value.type, digest });
    } else fields[field] = value;
  }
  return { kind: "multipart", fields, files };
}
async function fingerprint(transport: TaxonomyGatewayTransport, path: string, method: string, body: unknown): Promise<string> {
  const scope = transport.scopeId?.() ?? "session-unavailable";
  const source = new TextEncoder().encode(`${scope}\u0000${method}\u0000${path}\u0000${await jsonBody(body)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  return `${prefix}${[...digest].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
function markerValue(state: string, path: string, resourcePath: string, scopeHash: string, status?: number, method?: string, body?: unknown, correlationId?: string, owner?: string): string {
  return JSON.stringify({ state, path, resourcePath, scopeHash, owner, status, method, body: body ?? null, correlationId, at: Date.now() });
}
function pendingKeys(): string[] {
  try { return Object.keys(sessionStorage).filter(key => key.startsWith(prefix)); }
  catch { return []; }
}
function clear(key: string): void { try { sessionStorage.removeItem(key); } catch { /* retained markers fail closed */ } }

export async function taxonomySend<T = unknown>(
  transport: TaxonomyGatewayTransport,
  path: string,
  method: "GET" | "POST" | "PATCH",
  signal: AbortSignal | undefined,
  body: unknown,
  expected: number,
  map?: (value: unknown) => T,
  semanticQuery = false,
  options: { retainConfirmed?: boolean; resourcePath?: string; entity?: string } = {},
): Promise<T> {
  signal?.throwIfAborted();
  if (!transport.requestWithInit) throw new Error("El cliente autenticado de Taxonomía no admite esta operación.");
  const owner = transport.scopeId?.() ?? "session-unavailable";
  const writing = method !== "GET" && !semanticQuery;
  if (writing && !map) throw new Error("La mutación requiere un mapeador de confirmación antes del envío.");
  const key = writing ? await fingerprint(transport, path, method, body) : undefined;
  if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió antes de iniciar la solicitud de Taxonomía.");
  const storedBody = writing ? await persistentBody(body) : undefined;
  if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió antes de iniciar la solicitud de Taxonomía.");
  const scopeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner)));
  if ((transport.scopeId?.() ?? "session-unavailable") !== owner) throw new Error("La sesión cambió antes de iniciar la solicitud de Taxonomía.");
  const scopeHash = [...scopeBytes].map(value => value.toString(16).padStart(2, "0")).join("");
  const correlationId = writing ? crypto.randomUUID() : undefined;
  if (key) {
    if (pendingKeys().includes(key)) {
      let confirmed = false; try { confirmed = JSON.parse(sessionStorage.getItem(key) ?? "{}").state === "confirmed"; } catch { /* malformed marker fails closed */ }
      throw new TaxonomyMutationError(confirmed ? "confirmed_read_failed" : "unknown", "Esta intención ya fue enviada y requiere reconciliación. Consulta el recurso antes de volver a intentarlo.", key);
    }
    const resourcePath = options.resourcePath ?? path;
    const conflicting = pendingKeys().some(pending => {
      try {
        const marker = JSON.parse(sessionStorage.getItem(pending) ?? "{}");
        return marker.scopeHash === scopeHash && marker.resourcePath === resourcePath;
      } catch { return true; }
    });
    if (conflicting) throw new TaxonomyMutationError("unknown", "Existe otra escritura sin resolver sobre este recurso. Consulta y reconcilia esa operación antes de enviar una intención distinta.", key);
    if (pendingKeys().filter(pending => { try { return JSON.parse(sessionStorage.getItem(pending) ?? "{}").scopeHash === scopeHash; } catch { return true; } }).length >= maxPending) throw new TaxonomyMutationError("unknown", "Hay demasiadas intenciones de Taxonomía pendientes de reconciliación; no se envió esta operación.", key);
    try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("dispatching", path, options.resourcePath ?? path, scopeHash, undefined, method, storedBody, correlationId, scopeHash)), entity: options.entity })); }
    catch (error) { throw new TaxonomyMutationError("unknown", "No se pudo proteger la intención en esta sesión; no se envió la mutación.", key, { cause: error }); }
  }
  const init = body instanceof FormData ? { method, signal, body } : body === undefined ? { method, signal } : { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let response: Response;
  try { response = await transport.requestWithInit(path, init); }
  catch (error) {
    if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("unknown", path, options.resourcePath ?? path, scopeHash, undefined, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* pre-dispatch marker remains */ } }
    if (writing) throw new TaxonomyMutationError("unknown", "No se confirmó el resultado de Taxonomía (transporte, timeout o cancelación). Consulta el recurso antes de reenviar.", key, { cause: error });
    throw error;
  }
  if (!response.ok) {
    let code: string | undefined;
    try { const value: unknown = await response.clone().json(); if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).code === "string") code = (value as Record<string, unknown>).code as string; } catch { /* status remains authoritative */ }
    if (writing && (response.status === 408 || response.status >= 500)) {
      if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("unknown", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* pre-dispatch marker remains */ } }
      throw new TaxonomyMutationError("unknown", `El resultado de Taxonomía es incierto (HTTP ${response.status}). Consulta antes de reenviar.`, key);
    }
    if (key) clear(key);
    throw new TaxonomyHttpError(response.status, code);
  }
  if (response.status !== expected) {
    if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", `Taxonomía confirmó HTTP ${response.status}, pero no coincide con el contrato esperado ${expected}. No repitas la mutación sin reconciliar.`, key);
    throw new TaxonomyHttpError(response.status);
  }
  if (response.status === 204) {
    if (key) clear(key);
    return null as T;
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el MIME de respuesta no permite reconciliarla. No la repitas.", key);
    throw new Error("Taxonomía devolvió un MIME incompatible.");
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch (error) {
    if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el cuerpo es ilegible. No la repitas sin reconciliar.", key, { cause: error });
    throw new Error("Taxonomía devolvió JSON ilegible.", { cause: error });
  }
  try {
    const mapped: TaxonomyMutationResult<T> = { outcome: "confirmed_mapped", value: map ? map(payload) : payload as T };
    if (key) {
      if (options.retainConfirmed) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("confirmed", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* marker remains */ } }
      else clear(key);
    }
    return mapped.value;
  } catch (error) {
    if (key) { try { sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status, method, storedBody, correlationId, scopeHash)), entity: options.entity })); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el DTO no pudo validarse. Consulta el recurso antes de repetirla.", key, { cause: error });
    throw error;
  }
}

function sameFields(observed: Record<string, unknown>, expected: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => Object.hasOwn(expected, key) && Object.is(observed[key], expected[key]));
}

function effectMatches(marker: Record<string, unknown>, observed: unknown): boolean {
  const body = marker.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return false;
  const path = typeof marker.path === "string" ? marker.path : "";
  const resourcePath = typeof marker.resourcePath === "string" ? marker.resourcePath : "";
  const idFrom = (route: string) => { try { return decodeURIComponent(route.split("/").filter(Boolean).pop() ?? ""); } catch { return ""; } };
  const root = observed && typeof observed === "object" && !Array.isArray(observed) ? observed as Record<string, unknown> : null;
  const versionAdvanced = (actual: unknown, field: string) => typeof body[field] === "number" && typeof actual === "number" && actual > Number(body[field]);
  if (marker.entity === "product_type_association") {
    const dto = root;
    const type = dto?.tipoProducto && typeof dto.tipoProducto === "object" ? dto.tipoProducto as Record<string, unknown> : null;
    const rows = Array.isArray(dto?.caracteristicas) ? dto.caracteristicas : [];
    const characteristicId = typeof body.caracteristicaId === "string" ? body.caracteristicaId : idFrom(path);
    const association = rows.find(item => item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).caracteristicaId === characteristicId) as Record<string, unknown> | undefined;
    const typeId = (() => { try { return decodeURIComponent(resourcePath.split("/caracteristicas")[0]?.split("/").filter(Boolean).pop() ?? ""); } catch { return ""; } })();
    return Boolean(type && type.tipoProductoId === typeId && association && association.caracteristicaId === characteristicId && association.obligatoria === body.obligatoria && versionAdvanced(dto?.schemaVersion, "schemaVersion"));
  }
  if (marker.entity === "characteristic") {
    return Boolean(root && root.caracteristicaId === idFrom(resourcePath) && versionAdvanced(root.version, "version") && sameFields(root, body, ["nombre", "unidadMedida"]));
  }
  if (marker.entity === "category") {
    return Boolean(root && root.categoriaId === idFrom(resourcePath) && versionAdvanced(root.version, "version") && sameFields(root, body, ["nombre", "categoriaPadreId", "descripcion", "orden"]));
  }
  if (marker.entity === "characteristic_value") {
    if (!Array.isArray(observed)) return false;
    const valueId = idFrom(path);
    const item = observed.find(entry => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).valorId === valueId) as Record<string, unknown> | undefined;
    return Boolean(item && item.valorId === valueId && versionAdvanced(item.version, "version") && sameFields(item, body, ["nombre"]));
  }
  return false;
}

export async function reconcileConfirmedTaxonomyResource(transport: TaxonomyGatewayTransport, resourcePath: string, observed?: unknown, requestOwner?: string): Promise<void> {
  let scope: string;
  try { scope = transport.scopeId?.() ?? "session-unavailable"; } catch { return; }
  if (requestOwner !== undefined && scope !== requestOwner) return;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope)));
  if ((transport.scopeId?.() ?? "session-unavailable") !== scope) return;
  const scopeHash = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  for (const key of pendingKeys()) {
    try {
      const marker = JSON.parse(sessionStorage.getItem(key) ?? "{}");
      if ((transport.scopeId?.() ?? "session-unavailable") !== scope) return;
      if (["unknown", "confirmed_unreadable", "confirmed_read_failed", "confirmed"].includes(marker.state) && marker.resourcePath === resourcePath && marker.scopeHash === scopeHash && (marker.owner === undefined || marker.owner === scopeHash || marker.owner === scope)) {
        if ((transport.scopeId?.() ?? "session-unavailable") !== scope) return;
        if (marker.state === "confirmed") { clear(key); continue; }
        const expected = marker.body as Record<string, unknown> | null;
        if (marker.entity === "brand" && expected?.kind === "multipart") {
          const dto = observed && typeof observed === "object" ? observed as Record<string, unknown> : null;
          const fields = expected.fields as Record<string, string> | undefined;
          const files = expected.files as unknown[] | undefined;
          const resourceId = typeof marker.resourcePath === "string" ? decodeURIComponent(marker.resourcePath.split("/").pop() ?? "") : "";
          const baseVersion = Number(fields?.version);
          const textMatches = Boolean(dto && fields && dto.marcaId === resourceId && typeof dto.version === "number" && dto.version > baseVersion &&
            (!Object.hasOwn(fields, "nombre") || dto.nombre === fields.nombre) &&
            (!Object.hasOwn(fields, "descripcion") || dto.descripcion === (fields.descripcion === "" ? null : fields.descripcion)) &&
            (!Object.hasOwn(fields, "paisOrigenIso") || dto.paisOrigenIso === (fields.paisOrigenIso === "" ? null : fields.paisOrigenIso)));
          if ((transport.scopeId?.() ?? "session-unavailable") !== scope) return;
          if (textMatches && (!files || files.length === 0)) { clear(key); continue; }
          try { if ((transport.scopeId?.() ?? "session-unavailable") === scope) sessionStorage.setItem(key, JSON.stringify({ ...marker, state: "confirmed_read_failed" })); } catch { /* marker remains */ }
          continue;
        }
        if ((transport.scopeId?.() ?? "session-unavailable") !== scope) return;
        if (observed !== undefined && effectMatches(marker, observed)) { clear(key); continue; }
        try { if ((transport.scopeId?.() ?? "session-unavailable") === scope) sessionStorage.setItem(key, JSON.stringify({ ...marker, state: "confirmed_read_failed" })); } catch { /* retains fail-closed state */ }
        // Keep presenting the authoritative resource; the pending write guard
        // still blocks subsequent mutations for this resource.
      }
    } catch (error) { if (error instanceof TaxonomyMutationError) throw error; /* malformed marker remains fail-closed */ }
  }
}

export function taxonomyHttpStatus(error: unknown): number | undefined { return error instanceof TaxonomyHttpError ? error.status : undefined; }
export function taxonomyHttpCode(error: unknown): string | undefined { return error instanceof TaxonomyHttpError ? error.code : undefined; }
