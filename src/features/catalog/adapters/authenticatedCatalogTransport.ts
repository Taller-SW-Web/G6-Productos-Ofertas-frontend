import type { G7Session } from "../../promotions/adapters/g7Session";
import { createAuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { CatalogHttpTransport } from "./catalogHttp";

// Todas las solicitudes comerciales usan Bearer G7; publicReads es compatibilidad inerte.
export function createAuthenticatedCatalogTransport(
  origin: string,
  session: G7Session,
  _options: { /** @deprecated Compatibilidad inerte; sin efecto bajo G7. */ publicReads?: boolean } = {},
): CatalogHttpTransport {
  void _options; // Retained for source compatibility; G7 is always required.
  const transport = createAuthenticatedGatewayClient(origin, session);
  return {
    request: (path, init) => transport.request(path, init),
  };
}
