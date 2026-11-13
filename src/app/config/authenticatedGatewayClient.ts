import { isGatewayTokenInvalid } from "../../features/shared/isGatewayTokenInvalid";
import { secureBase, type G7Session } from "../../features/promotions/adapters/g7Session";

export type GatewayMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface GatewayRequest {
  method: GatewayMethod;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  body?: BodyInit;
}

export interface AuthenticatedGatewayClient {
  request(path: string, request: GatewayRequest): Promise<Response>;
}

/** Browser client for one configured Gateway origin and the human G7 session. */
export function createAuthenticatedGatewayClient(
  gatewayOrigin: string,
  session: Pick<
    G7Session,
    "getAccessToken" | "refreshAccessToken" | "invalidateAccessToken"
  > & Partial<Pick<G7Session, "getSessionVersion">>,
  fetcher: typeof fetch = fetch,
): AuthenticatedGatewayClient {
  const origin = secureBase(gatewayOrigin, true);

  async function send(
    path: string,
    request: GatewayRequest,
    token: string,
    signal: AbortSignal,
    correlationId: string,
  ): Promise<Response> {
    if (!path.startsWith("/api/v1/") || path.startsWith("//") || path.includes("\\"))
      throw new Error("La ruta no pertenece al contrato API del Gateway.");
    const rawPath = path.split(/[?#]/, 1)[0] ?? "";
    for (const segment of rawPath.split("/")) {
      let decoded = segment;
      try {
        let stable = false;
        for (let depth = 0; depth < 10; depth++) {
          const next = decodeURIComponent(decoded);
          if (next === decoded) { stable = true; break; }
          decoded = next;
        }
        if (!stable) throw new Error("La ruta tiene demasiadas capas de codificación.");
      } catch {
        throw new Error("La ruta contiene un segmento codificado inválido.");
      }
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || [...decoded].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
        throw new Error("La ruta contiene un segmento que puede escapar del API del Gateway.");
    }
    const target = new URL(path, origin);
    if (target.origin !== origin || !target.pathname.startsWith("/api/v1/")) throw new Error("Destino de Gateway no válido.");
    return fetcher(target.href, {
      method: request.method,
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...request.headers,
        Authorization: `Bearer ${token}`,
        "X-Correlation-Id": request.headers?.["X-Correlation-Id"] ?? correlationId,
      },
      ...(request.body === undefined ? {} : { body: request.body }),
    });
  }

  return {
    async request(path, request) {
      const version = session.getSessionVersion?.();
      const assertSession = () => {
        if (session.getSessionVersion?.() !== version)
          throw new Error("La sesión cambió durante la operación.");
      };
      const timeout = AbortSignal.timeout(15_000);
      const signal = request.signal
        ? AbortSignal.any([request.signal, timeout])
        : timeout;
      signal.throwIfAborted();
      const token = await session.getAccessToken(signal);
      signal.throwIfAborted();
      assertSession();
      if (!token) throw new Error("Inicia sesión para continuar.");
      const correlationId =
        request.headers?.["X-Correlation-Id"] ?? crypto.randomUUID();
      const response = await send(path, request, token, signal, correlationId);
      assertSession();
      if (!(await isGatewayTokenInvalid(response))) return response;
      assertSession();
      if (request.method === "GET") {
        const refreshed = await session.refreshAccessToken(token, signal);
        signal.throwIfAborted();
        if (!refreshed) {
          session.invalidateAccessToken(token);
          return response;
        }
        assertSession();
        const retried = await send(path, request, refreshed, signal, correlationId);
        assertSession();
        if (await isGatewayTokenInvalid(retried)) session.invalidateAccessToken(refreshed);
        return retried;
      }
      // A contractual rejection ends the session without replaying the write.
      session.invalidateAccessToken(token);
      return response;
    },
  };
}
