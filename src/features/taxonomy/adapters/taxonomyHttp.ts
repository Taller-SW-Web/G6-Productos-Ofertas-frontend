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
async function fingerprint(transport: TaxonomyGatewayTransport, path: string, method: string, body: unknown): Promise<string> {
  const scope = transport.scopeId?.() ?? "session-unavailable";
  const source = new TextEncoder().encode(`${scope}\u0000${method}\u0000${path}\u0000${await jsonBody(body)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  return `${prefix}${[...digest].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
function markerValue(state: string, path: string, resourcePath: string, scopeHash: string, status?: number): string {
  return JSON.stringify({ state, path, resourcePath, scopeHash, status, at: Date.now() });
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
  options: { retainConfirmed?: boolean; resourcePath?: string } = {},
): Promise<T> {
  signal?.throwIfAborted();
  if (!transport.requestWithInit) throw new Error("El cliente autenticado de Taxonomía no admite esta operación.");
  const writing = method !== "GET" && !semanticQuery;
  if (writing && !map) throw new Error("La mutación requiere un mapeador de confirmación antes del envío.");
  const key = writing ? await fingerprint(transport, path, method, body) : undefined;
  const scopeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(transport.scopeId?.() ?? "session-unavailable")));
  const scopeHash = [...scopeBytes].map(value => value.toString(16).padStart(2, "0")).join("");
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
    try { sessionStorage.setItem(key, markerValue("dispatching", path, options.resourcePath ?? path, scopeHash)); }
    catch (error) { throw new TaxonomyMutationError("unknown", "No se pudo proteger la intención en esta sesión; no se envió la mutación.", key, { cause: error }); }
  }
  const init = body instanceof FormData ? { method, signal, body } : body === undefined ? { method, signal } : { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let response: Response;
  try { response = await transport.requestWithInit(path, init); }
  catch (error) {
    if (key) { try { sessionStorage.setItem(key, markerValue("unknown", path, options.resourcePath ?? path, scopeHash)); } catch { /* pre-dispatch marker remains */ } }
    if (writing) throw new TaxonomyMutationError("unknown", "No se confirmó el resultado de Taxonomía (transporte, timeout o cancelación). Consulta el recurso antes de reenviar.", key, { cause: error });
    throw error;
  }
  if (!response.ok) {
    let code: string | undefined;
    try { const value: unknown = await response.clone().json(); if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).code === "string") code = (value as Record<string, unknown>).code as string; } catch { /* status remains authoritative */ }
    if (writing && (response.status === 408 || response.status >= 500)) {
      if (key) { try { sessionStorage.setItem(key, markerValue("unknown", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* pre-dispatch marker remains */ } }
      throw new TaxonomyMutationError("unknown", `El resultado de Taxonomía es incierto (HTTP ${response.status}). Consulta antes de reenviar.`, key);
    }
    if (key) clear(key);
    throw new TaxonomyHttpError(response.status, code);
  }
  if (response.status !== expected) {
    if (key) { try { sessionStorage.setItem(key, markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", `Taxonomía confirmó HTTP ${response.status}, pero no coincide con el contrato esperado ${expected}. No repitas la mutación sin reconciliar.`, key);
    throw new TaxonomyHttpError(response.status);
  }
  if (response.status === 204) {
    if (key) clear(key);
    return null as T;
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    if (key) { try { sessionStorage.setItem(key, markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el MIME de respuesta no permite reconciliarla. No la repitas.", key);
    throw new Error("Taxonomía devolvió un MIME incompatible.");
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch (error) {
    if (key) { try { sessionStorage.setItem(key, markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el cuerpo es ilegible. No la repitas sin reconciliar.", key, { cause: error });
    throw new Error("Taxonomía devolvió JSON ilegible.", { cause: error });
  }
  try {
    const mapped: TaxonomyMutationResult<T> = { outcome: "confirmed_mapped", value: map ? map(payload) : payload as T };
    if (key) {
      if (options.retainConfirmed) { try { sessionStorage.setItem(key, markerValue("confirmed", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* marker remains */ } }
      else clear(key);
    }
    return mapped.value;
  } catch (error) {
    if (key) { try { sessionStorage.setItem(key, markerValue("confirmed_unreadable", path, options.resourcePath ?? path, scopeHash, response.status)); } catch { /* marker remains */ } }
    if (writing) throw new TaxonomyMutationError("confirmed_unreadable", "Taxonomía confirmó la mutación, pero el DTO no pudo validarse. Consulta el recurso antes de repetirla.", key, { cause: error });
    throw error;
  }
}

export async function reconcileConfirmedTaxonomyResource(transport: TaxonomyGatewayTransport, resourcePath: string): Promise<void> {
  let scope: string;
  try { scope = transport.scopeId?.() ?? "session-unavailable"; } catch { return; }
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope)));
  const scopeHash = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  for (const key of pendingKeys()) {
    try {
      const marker = JSON.parse(sessionStorage.getItem(key) ?? "{}");
      if (marker.state === "confirmed" && marker.resourcePath === resourcePath && marker.scopeHash === scopeHash) clear(key);
    } catch { /* malformed marker remains fail-closed */ }
  }
}

export function taxonomyHttpStatus(error: unknown): number | undefined { return error instanceof TaxonomyHttpError ? error.status : undefined; }
export function taxonomyHttpCode(error: unknown): string | undefined { return error instanceof TaxonomyHttpError ? error.code : undefined; }
