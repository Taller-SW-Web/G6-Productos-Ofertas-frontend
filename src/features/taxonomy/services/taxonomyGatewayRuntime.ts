import type { TaxonomyGatewayTransport } from "../adapters/httpProductTypeAdapter";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";

function secureGatewayOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) {
    throw new Error("Configura una URL HTTPS válida para la integración.");
  }
  return url.href.replace(/\/$/, "");
}

export interface TaxonomySession {
  getAccessToken(signal: AbortSignal): Promise<string | null>;
  refreshAccessToken(rejected: string, signal: AbortSignal): Promise<string | null>;
  invalidateAccessToken(rejected: string): void;
}

export class TaxonomySessionRequiredError extends Error {
  constructor() {
    super("Inicia sesión y vuelve a intentar la consulta de Taxonomía.");
    this.name = "TaxonomySessionRequiredError";
  }
}

export class TaxonomyNetworkError extends Error {
  constructor(cause: unknown) {
    super("No se pudo conectar con Taxonomía. Comprueba la conexión.", { cause });
    this.name = "TaxonomyNetworkError";
  }
}

export class TaxonomyGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`No se pudo completar la consulta de Taxonomía (HTTP ${status}).`);
    this.name = "TaxonomyGatewayError";
  }
}

export function createAuthenticatedTaxonomyGateway(
  gatewayOrigin: string,
  session: TaxonomySession,
  fetcher: typeof fetch = fetch,
  options: { publicReads?: boolean } = {},
): TaxonomyGatewayTransport {
  const origin = secureGatewayOrigin(gatewayOrigin);
  return {
    async request(path, signal, correlationId, requestOptions) {
      const method = requestOptions?.method ?? "GET";
      const body = requestOptions?.body;
      const multipart = body instanceof FormData;
      const publicRead = options.publicReads && method === "GET" && !requestOptions?.authenticated;
      signal.throwIfAborted();
      const token = await session.getAccessToken(signal);
      signal.throwIfAborted();
      if (!token) throw new TaxonomySessionRequiredError();
      const requestId = correlationId ?? crypto.randomUUID();
      const send = (accessToken: string) =>
        fetcher(origin + path, {
          method,
          ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
          signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          headers: {
            ...(publicRead ? {} : { Authorization: `Bearer ${accessToken}` }),
            ...(body !== undefined && !multipart ? { "Content-Type": "application/json" } : {}),
            "X-Correlation-Id": requestId,
          },
        });
      const safeSend = async (accessToken: string) => {
        try { return await send(accessToken); } catch (error) {
          if (signal.aborted) throw signal.reason;
          throw new TaxonomyNetworkError(error);
        }
      };
      let response = await safeSend(token);
      signal.throwIfAborted();
      if (method === "GET" && !publicRead && await isGatewayTokenInvalid(response)) {
        const renewed = await session.refreshAccessToken(token, signal);
        signal.throwIfAborted();
        if (!renewed) {
          session.invalidateAccessToken(token);
          throw new TaxonomyGatewayError(401, "TOKEN_INVALIDO");
        }
        response = await safeSend(renewed);
        signal.throwIfAborted();
        if (await isGatewayTokenInvalid(response)) session.invalidateAccessToken(renewed);
      }
      if (!response.ok) {
        let code: string | undefined;
        try {
          const problem: unknown = await response.clone().json();
          if (problem && typeof problem === "object" && "code" in problem && typeof problem.code === "string") code = problem.code;
        } catch { /* El código del problema es opcional. */ }
        throw new TaxonomyGatewayError(response.status, code);
      }
      return response;
    },
  };
}
let gateway: TaxonomyGatewayTransport | undefined;
export function configureTaxonomyGateway(
  transport: TaxonomyGatewayTransport | undefined,
): void {
  gateway = transport;
}
export function getTaxonomyGateway(): TaxonomyGatewayTransport | undefined {
  return gateway;
}
export function isTaxonomyGatewayConfigured(): boolean {
  return gateway !== undefined;
}
