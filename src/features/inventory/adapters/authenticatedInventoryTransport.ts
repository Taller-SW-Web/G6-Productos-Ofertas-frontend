import type { G7Session } from "../../promotions/adapters/g7Session";
import { createAuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
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

  const client = session ? createAuthenticatedGatewayClient(url.origin, session, fetcher) : null;
  return {
    async request(path: string, init: InventoryHttpRequest): Promise<Response> {
      if (!client) throw new Error("Inicia sesión para continuar.");
      return client.request(path, init);
    },
  };
}
