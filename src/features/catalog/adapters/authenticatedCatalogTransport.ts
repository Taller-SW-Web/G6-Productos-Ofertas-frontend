import type { G7Session } from "../../promotions/adapters/g7Session";
import { isGatewayTokenInvalid } from "../../shared/isGatewayTokenInvalid";
import { createCatalogFetchTransport, type CatalogHttpTransport } from "./catalogHttp";

// Keep the public read demo on its existing transport. Administration uses G7.
export function createAuthenticatedCatalogTransport(origin: string, session: G7Session): CatalogHttpTransport {
  const transport = createCatalogFetchTransport(origin);
  return {
    async request(path, init) {
      const token = await session.getAccessToken(init.signal);
      if (!token) throw new Error("Inicia sesión para continuar.");
      const send = (accessToken: string) => transport.request(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
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
