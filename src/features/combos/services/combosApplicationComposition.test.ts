import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedGatewayClient } from "../../../app/config/authenticatedGatewayClient";
import type { G7Session } from "../../promotions/adapters/g7Session";
import { createOptionalCatalogHttpServices } from "../../catalog/services/catalogHttpRuntime";
import { createApplicationCombosRuntime } from "./combosService";
import type { PricingRuntime } from "../../pricing/services/pricingRuntime";

const emptyPage = { items: [], meta: { pagina: 1, tamanio: 20, total: 0, totalPaginas: 0 } };
const resolution = (sku: string) => ({ items: [{
  sku, resultado: "ELEGIBLE", productId: "product-1", nombre: "Producto",
  productoPadre: { productId: "product-1", nombre: "Producto", tieneVariantes: false, estado: "ACTIVO" },
  variante: null, estado: "ACTIVO", tipoProductoId: "tipo-normal",
}] });

function setup(token: string) {
  const session = {
    snapshot: () => ({ user: { id: token, roles: token === "gestor" ? ["GESTOR_COMERCIAL"] : [] } }),
    getAccessToken: vi.fn(async () => token),
    refreshAccessToken: vi.fn(async () => null),
    invalidateAccessToken: vi.fn(),
  } as unknown as G7Session;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const bearer = new Headers(init?.headers).get("Authorization");
    if (url.pathname.includes("/precios/") || url.pathname.includes("/internal/"))
      throw new Error(`No se permite Pricing privado desde el navegador: ${url.pathname}`);
    if (url.pathname === "/api/v1/productos/administracion" || url.pathname === "/api/v1/productos/administracion/skus/resolver") {
      if (bearer !== "Bearer gestor") return Response.json({ code: "SCOPE_INSUFICIENTE" }, { status: 403 });
      return url.pathname.endsWith("/resolver") ? Response.json(resolution("SKU-001")) : Response.json(emptyPage);
    }
    return Response.json({ code: "NO_ENCONTRADO" }, { status: 404 });
  });
  const client = createAuthenticatedGatewayClient("https://gateway.example", session, fetcher);
  const services = createOptionalCatalogHttpServices("https://gateway.example", session, client, true)!;
  const runtimePromise = createApplicationCombosRuntime("api", {} as PricingRuntime, {
    gateway: client, catalogServices: services, adminApi: true,
    scopeId: () => token,
  });
  return { session, fetcher, runtimePromise };
}

describe("composición real de Combos de startApplication", () => {
  it("usa el repositorio administrativo para listado, búsqueda y resolución batch con JWT humano", async () => {
    const { fetcher, runtimePromise } = setup("gestor");
    const runtime = await runtimePromise;
    await runtime.catalog.listProducts("", 1, 20);
    await runtime.catalog.listProducts("texto", 1, 20);
    await expect(runtime.catalog.resolveSkus(["SKU-001"])).resolves.toMatchObject([
      { sku: "SKU-001", productId: "product-1", sellable: true },
    ]);

    const requests = fetcher.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), init }));
    expect(requests.slice(0, 2).map(({ url }) => url.pathname)).toEqual([
      "/api/v1/productos/administracion", "/api/v1/productos/administracion",
    ]);
    expect(requests[1]?.url.searchParams.get("q")).toBe("texto");
    expect(requests[2]?.url.pathname).toBe("/api/v1/productos/administracion/skus/resolver");
    expect(requests[2]?.init?.method).toBe("POST");
    expect(requests.every(({ init }) => new Headers(init?.headers).get("Authorization") === "Bearer gestor")).toBe(true);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("/precios/") || String(input).includes("/internal/"))).toBe(false);
  });

  it("preserva el rechazo 403 de un usuario sin GESTOR_COMERCIAL", async () => {
    const { fetcher, runtimePromise } = setup("lector");
    const runtime = await runtimePromise;
    await expect(runtime.catalog.resolveSkus(["SKU-001"])).rejects.toMatchObject({ kind: "forbidden" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer lector" });
  });

});
