import { isGatewayTokenInvalid } from "../../features/shared/isGatewayTokenInvalid";
import { secureBase, type G7Session } from "../../features/promotions/adapters/g7Session";

export type GatewayMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type GatewayRequestMethod = GatewayMethod | "POST_READ";

export interface GatewayRequest {
  /** POST_READ is a logical read and is only accepted for the published SKU resolver. */
  method: GatewayRequestMethod;
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
      method: request.method === "POST_READ" ? "POST" : request.method,
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...Object.fromEntries(Object.entries(request.headers ?? {}).filter(([name]) => name.toLowerCase() !== "authorization")),
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
      const replayableRead = request.method === "GET" || (
        request.method === "POST_READ" &&
        path === "/api/v1/productos/administracion/skus/resolver"
      );
      if (request.method === "POST_READ" && !replayableRead)
        throw new Error("POST_READ solo está habilitado para el resolver administrativo de SKU.");
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
      if (replayableRead) {
        const refreshed = await session.refreshAccessToken(token, signal);
        signal.throwIfAborted();
        if (!refreshed) {
          session.invalidateAccessToken(token);
          return response;
        }
        assertSession();
        const retried = await send(path, request, refreshed, signal, correlationId);
        assertSession();
        // A token freshly confirmed by G7 can still be rejected by one service
        // (e.g. incompatible audience policy). Keep identity and report denial.
        return retried;
      }
      // Recover identity for the next user action, never replay this write.
      const refreshed = await session.refreshAccessToken(token, signal);
      if (!refreshed) session.invalidateAccessToken(token);
      return response;
    },
  };
}
