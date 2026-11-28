import { afterEach, describe, expect, it, vi } from "vitest";
import { G7Session } from "../promotions/adapters/g7Session";
import { createAuthenticatedGatewayClient } from "../../app/config/authenticatedGatewayClient";
import { createAuthenticatedCatalogTransport } from "../catalog/adapters/authenticatedCatalogTransport";
import { createAuthenticatedInventoryTransport } from "../inventory/adapters/authenticatedInventoryTransport";
import { createAuthenticatedTaxonomyGateway } from "../taxonomy/services/taxonomyGatewayRuntime";
import { createReadOnlyClient } from "../reads/readOnlyClient";
import { createHttpBulkRepository } from "../bulk/adapters/httpBulkRepository";
import { createPromotionSessionRuntime } from "../promotions/services/promotionSessionRuntime";

afterEach(() => vi.restoreAllMocks());
describe.each(["Gateway/Pricing/Combos/Audit", "Catálogo", "Inventario", "Taxonomía", "Consultas", "Bulk", "Promociones"])("F02 %s", client => {
  it.each([401, 403, 429, 503, "red"])("conserva sesión y evita retry automático ante %s ajeno a G7", async status => {
    const session = new G7Session("https://g7.example.test");
    vi.spyOn(session, "getAccessToken").mockResolvedValue("local-test-token");
    const refresh = vi.spyOn(session, "refreshAccessToken");
    const invalidate = vi.spyOn(session, "invalidateAccessToken");
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (status === "red") throw new TypeError("Failed to fetch");
      return Response.json({ code: status === 403 ? "SCOPE_INSUFICIENTE" : "RECHAZO_DE_OPERACION" }, { status: Number(status), headers: { "Retry-After": "2" } });
    });
    const origin = "https://gateway.example.test", signal = new AbortController().signal;
    const work = () => {
      switch (client) {
        case "Catálogo": return createAuthenticatedCatalogTransport(origin, session).request("/api/v1/productos", { method: "GET", signal, headers: {} });
        case "Inventario": return createAuthenticatedInventoryTransport(origin, session).request("/api/v1/inventario/umbrales", { method: "GET", signal });
        case "Taxonomía": return createAuthenticatedTaxonomyGateway(origin, session).request("/api/v1/tipos-producto", signal);
        case "Consultas": return createReadOnlyClient(origin, session).read("listarProductos", {}, signal);
        case "Bulk": return createHttpBulkRepository({ request: (path, init) => fetch(origin + path, init) }, session).getTemplate("CSV", signal);
        case "Promociones": return createPromotionSessionRuntime(origin, "https://g7.example.test", session).services.coupons.list({ status: "all", page: 1, pageSize: 10 }, signal);
        default: return createAuthenticatedGatewayClient(origin, session).request("/api/v1/precios", { method: "GET", signal });
      }
    };
    await work().catch(error => { expect(error).toBeInstanceOf(Error); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
