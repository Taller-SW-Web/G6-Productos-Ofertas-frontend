import type { G7Session } from "../../promotions/adapters/g7Session";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";
import type {
  InventoryHttpRequest,
  InventoryHttpTransport,
} from "./apiInventoryAdapter";

export function createAuthenticatedInventoryTransport(
  origin: string,
  session: G7Session | null,
  fetcher: typeof fetch = fetch,
): InventoryHttpTransport {
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
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "VITE_GATEWAY_ORIGIN debe ser un origen HTTPS o loopback HTTP, sin credenciales ni ruta.",
    );
  }

  return {
    async request(path: string, init: InventoryHttpRequest): Promise<Response> {
      const targetUrl = url.origin + path;
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(init.headers ?? {}),
      };

      if (!session) {
        return fetcher(targetUrl, {
          method: init.method,
          headers,
          body: init.body,
          signal: init.signal,
          credentials: "omit",
          redirect: "error",
        });
      }

      const signal = init.signal ?? new AbortController().signal;
      const token = await session.getAccessToken(signal);
      if (!token) throw new Error("Inicia sesión para continuar.");

      const send = (accessToken: string) =>
        fetcher(targetUrl, {
          method: init.method,
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
          body: init.body,
          signal: init.signal,
          credentials: "omit",
          redirect: "error",
        });

      const response = await send(token);
      if (!(await isGatewayTokenInvalid(response))) return response;

      if (init.method === "GET") {
        const renewed = await session.refreshAccessToken(token, signal);
        if (renewed) {
          const retry = await send(renewed);
          if (await isGatewayTokenInvalid(retry))
            session.invalidateAccessToken(renewed);
          return retry;
        }
      }

      // No automatic write replay; a 403 or write 401 preserves the session and backend denial.
      session.invalidateAccessToken(token);
      return response;
    },
  };
}

