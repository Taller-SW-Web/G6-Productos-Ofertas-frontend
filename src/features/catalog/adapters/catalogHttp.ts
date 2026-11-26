import { CatalogError } from "../services/catalogRepository";

/** Narrow boundary for #45's shared client. No session, retries or identity here. */
export interface CatalogHttpTransport {
  request(
    path: string,
    init: {
      method: "GET" | "POST" | "POST_READ" | "PATCH";
      signal: AbortSignal;
      headers: Record<string, string>;
      body?: string;
    },
  ): Promise<Response>;
}

export const CATALOG_RETRY_AFTER_MS = Symbol("catalogRetryAfterMs");
export const CATALOG_RESPONSE_CORRELATION_ID = Symbol("catalogResponseCorrelationId");

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (seconds) {
    const milliseconds = Number(seconds[1]) * 1000;
    return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : undefined;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export function blockedCatalog(message: string): never {
  throw new CatalogError("blocked_contract", message);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return blockedCatalog(
      "La respuesta del servicio no tiene la estructura esperada.",
    );
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== "string" || !value.length)
    return blockedCatalog("La respuesta del servicio está incompleta.");
  return value;
}
export function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    return blockedCatalog("La paginación o versión recibida no es válida.");
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    return blockedCatalog("El servicio no entregó la colección requerida.");
  return value;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    return blockedCatalog("El servicio no entregó el estado requerido.");
  return value;
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
): T {
  if (!choices.some((item) => item === value))
    return blockedCatalog("El servicio devolvió un estado desconocido.");
  return value as T;
}
export const encoded = (value: string) => encodeURIComponent(string(value));

const kinds: Record<string, CatalogError["kind"]> = {
  SKU_DUPLICADO: "duplicate_sku",
  COMBINACION_DUPLICADA: "duplicate_combination",
  VERSION_CONFLICT: "version_conflict",
  PREPARACION_NO_REINTENTABLE: "prep_not_retryable",
  PRODUCTO_NO_ADMITE_VARIANTES: "product_not_variants",
  SKU_INVALIDO: "validation",
  VALIDACION: "validation",
  ATRIBUTO_IDENTIFICADOR_INVALIDO: "invalid_attribute",
  IMAGEN_INVALIDA: "invalid_image",
  PERFIL_FISICO_INVALIDO: "invalid_physical",
  TIPO_PRODUCTO_INVALIDO: "invalid_master",
  CATEGORIA_INVALIDA: "invalid_master",
  MARCA_INVALIDA: "invalid_master",
  DATOS_INCOMPLETOS: "activation_rejected",
  DATOS_FISICOS_INCOMPLETOS: "invalid_physical",
  CAMBIO_ESTRUCTURAL_NO_PERMITIDO: "conflict",
};
export function createCatalogHttp(transport: CatalogHttpTransport) {
  return async function request(
    path: string,
    method: "GET" | "POST" | "POST_READ" | "PATCH" = "GET",
    body?: unknown,
    signal?: AbortSignal,
    expected = 200,
  ): Promise<unknown> {
    const isCommercialWrite = method === "POST" || method === "PATCH";
    const correlation = crypto.randomUUID();
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000);
    let response: Response;
    try {
      response = await transport.request("/api/v1" + path, {
        method,
        signal: combined,
        headers: {
          Accept: "application/json",
          "X-Correlation-Id": correlation,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted && !isCommercialWrite) throw error;
      throw new CatalogError(
        !isCommercialWrite ? "server" : "write_unknown",
        !isCommercialWrite
          ? "No se pudo consultar el servicio. Intente consultar nuevamente."
          : "No se pudo confirmar la escritura. Conserve los datos y consulte el resultado antes de volver a enviarla.",
        isCommercialWrite ? { correlationId: correlation } : undefined,
      );
    }
    if (!response.ok) {
      let problem: Record<string, unknown> = {};
      try {
        problem = object(await response.json());
      } catch {
        /* HTTP status still authoritative. */
      }
      const code =
        typeof problem.code === "string" && /^[A-Z_0-9]+$/.test(problem.code)
          ? problem.code
          : "ERROR_HTTP";
      const ref = response.headers.get("X-Correlation-Id") ?? correlation;
      if (
        isCommercialWrite &&
        (response.status === 408 || response.status >= 500)
      ) {
        throw new CatalogError(
          "write_unknown",
          `No se confirmó la escritura (${response.status}, ${code}). Consulte antes de repetirla. Referencia: ${ref}.`,
          { code, status: String(response.status), correlationId: ref },
        );
      }
      const kind =
        response.status === 401
          ? "session"
          : response.status === 403
            ? "forbidden"
            : (kinds[code] ??
              (response.status === 404
                ? "not_found"
                : response.status === 409
                  ? "conflict"
                  : response.status >= 500
                    ? "server"
                    : "validation"));
      throw new CatalogError(
        kind,
        `No se pudo completar la operación (${response.status}, ${code}). Referencia: ${ref}.`,
        { code, status: String(response.status), correlationId: ref },
      );
    }
    if (
      response.status !== expected ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      throw new CatalogError(
        isCommercialWrite ? "write_unknown" : "server",
        "La respuesta no permite confirmar el resultado.",
        isCommercialWrite ? { correlationId: response.headers.get("X-Correlation-Id") ?? correlation } : undefined,
      );
    }
    try {
      const value: unknown = await response.json();
      const retryAfterMs = retryAfterMilliseconds(response.headers.get("Retry-After"));
      if (retryAfterMs !== undefined && value && typeof value === "object" && !Array.isArray(value)) {
        Object.defineProperty(value, CATALOG_RETRY_AFTER_MS, { value: retryAfterMs });
      }
      const responseCorrelationId = response.headers.get("X-Correlation-Id");
      if (responseCorrelationId && value && typeof value === "object" && !Array.isArray(value)) {
        Object.defineProperty(value, CATALOG_RESPONSE_CORRELATION_ID, { value: responseCorrelationId });
      }
      return value;
    } catch {
      throw new CatalogError(
        isCommercialWrite ? "write_unknown" : "server",
        "El servicio devolvió una respuesta ilegible.",
        isCommercialWrite ? { correlationId: response.headers.get("X-Correlation-Id") ?? correlation } : undefined,
      );
    }
  };
}

/** Phase 1 transport only. #45 can inject the shared authenticated client unchanged. */
export function createCatalogFetchTransport(
  origin: string,
  fetcher: typeof fetch = fetch,
): CatalogHttpTransport {
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "VITE_GATEWAY_ORIGIN debe ser un origen HTTPS o loopback HTTP, sin credenciales ni ruta.",
    );
  }
  return {
    request: (path, init) =>
      fetcher(url.origin + path, {
        ...init,
        method: init.method === "POST_READ" ? "POST" : init.method,
        credentials: "omit",
        redirect: "error",
      }),
  };
}
