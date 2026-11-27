import type { G7Session } from "../../promotions/adapters/g7Session";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";
import { createCatalogFetchTransport, type CatalogHttpTransport } from "./catalogHttp";

// Todas las solicitudes comerciales usan Bearer G7; publicReads es compatibilidad inerte.
export function createAuthenticatedCatalogTransport(
  origin: string,
  session: G7Session,
  _options: { /** @deprecated Compatibilidad inerte; sin efecto bajo G7. */ publicReads?: boolean } = {},
): CatalogHttpTransport {
  void _options; // Retained for source compatibility; G7 is always required.
  const transport = createCatalogFetchTransport(origin);
  return {
    async request(path, init) {
      const token = await session.getAccessToken(init.signal);
      if (!token) throw new Error("Inicia sesión para continuar.");
      const send = (accessToken: string) => {
        const headers = Object.fromEntries(Object.entries(init.headers)
          .filter(([name]) => name.toLowerCase() !== "authorization"));
        headers.Authorization = `Bearer ${accessToken}`;
        return transport.request(path, { ...init, headers });
      };
      const response = await send(token);
      if (!(await isGatewayTokenInvalid(response))) return response;
      if (init.method === "GET") {
        const renewed = await session.refreshAccessToken(token, init.signal);
        if (renewed) {
          const retry = await send(renewed);
          if (await isGatewayTokenInvalid(retry)) session.invalidateAccessToken(renewed);
          return retry;
        }
      }
      // No automatic write replay; a 403 preserves the session and backend denial.
      session.invalidateAccessToken(token);
      return response;
    },
  };
}
