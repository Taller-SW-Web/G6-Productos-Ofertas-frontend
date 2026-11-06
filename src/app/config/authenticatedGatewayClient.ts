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

function isRecoverableUnauthorized(response: Response): Promise<boolean> {
  return response.clone().json().then(
    (body: unknown) =>
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).code === "TOKEN_INVALIDO",
    () => false,
  );
}

/** Browser client for one configured Gateway origin and the human G7 session. */
export function createAuthenticatedGatewayClient(
  gatewayOrigin: string,
  session: Pick<
    G7Session,
    "getAccessToken" | "refreshAccessToken" | "invalidateAccessToken"
  >,
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
      const timeout = AbortSignal.timeout(15_000);
      const signal = request.signal
        ? AbortSignal.any([request.signal, timeout])
        : timeout;
      signal.throwIfAborted();
      const token = await session.getAccessToken(signal);
      signal.throwIfAborted();
      if (!token) throw new Error("Inicia sesión para continuar.");
      const correlationId =
        request.headers?.["X-Correlation-Id"] ?? crypto.randomUUID();
      const response = await send(path, request, token, signal, correlationId);
      if (response.status !== 401) return response;

      if (request.method === "GET" && (await isRecoverableUnauthorized(response))) {
        const refreshed = await session.refreshAccessToken(token, signal);
        signal.throwIfAborted();
        if (!refreshed) return response;
        const retried = await send(path, request, refreshed, signal, correlationId);
        if (retried.status === 401) session.invalidateAccessToken(refreshed);
        return retried;
      }

      // Mutations are never replayed automatically. A 401 also ends the local
      // session so the user cannot continue with stale credentials.
      session.invalidateAccessToken(token);
      return response;
    },
  };
}
