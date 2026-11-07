import { afterEach, describe, expect, it, vi } from "vitest";
import { G7Session } from "../promotions/adapters/g7Session";
import { createAuthenticatedCatalogTransport } from "../catalog/adapters/authenticatedCatalogTransport";
import { createAuthenticatedTaxonomyGateway } from "../taxonomy/services/taxonomyGatewayRuntime";
import { createPromotionSessionRuntime } from "../promotions/services/promotionSessionRuntime";
import { createHttpBulkRepository } from "../bulk/adapters/httpBulkRepository";
import { publicReadEntries } from "../../app/routes/publicReadEntries";
import { readOperations } from "../reads/readOperations";

const origin = "https://gateway.example.test";
const signal = () => new AbortController().signal;
const denied = () => Response.json({ code: "TOKEN_INVALIDO" }, { status: 401 });
function setup() {
  const session = new G7Session("https://g7.example.test/api/v1");
  vi.spyOn(session, "getAccessToken").mockResolvedValue("test-access");
  vi.spyOn(session, "refreshAccessToken").mockResolvedValue("test-renewed");
  vi.spyOn(session, "invalidateAccessToken").mockImplementation(() => {});
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => denied());
  return { session, fetcher };
}
afterEach(() => vi.restoreAllMocks());

describe("login conservado y lecturas públicas sin JWT", () => {
  it("las entradas de lectura usan operaciones publicadas y excluyen las rutas de escritura", () => {
    for (const [path, id] of Object.entries(publicReadEntries)) {
      expect(readOperations.some(operation => operation.id === id)).toBe(true);
      expect(path).not.toMatch(/nuevo|nueva|editar|activar|desactivar|reactivar|importar|exportar/);
    }
    expect(publicReadEntries["/productos"]).toBe("listarProductos");
  });
  it.each(["Catálogo", "Taxonomía", "Promociones", "Bulk"])("%s no envía bearer ni renueva/invalida la sesión ante un GET público denegado", async feature => {
    const { session, fetcher } = setup();
    if (feature === "Catálogo") {
      const response = await createAuthenticatedCatalogTransport(origin, session, { publicReads: true })
        .request("/api/v1/categorias", { method: "GET", headers: { authorization: "must-be-removed" }, signal: signal() });
      expect(response.status).toBe(401);
    } else if (feature === "Taxonomía") {
      await expect(createAuthenticatedTaxonomyGateway(origin, session, fetch, { publicReads: true })
        .request("/api/v1/tipos-producto", signal())).rejects.toMatchObject({ status: 401 });
    } else if (feature === "Promociones") {
      const runtime = createPromotionSessionRuntime(origin, "https://g7.example.test/api/v1", session, { publicReads: true });
      await expect(runtime.services.coupons.list({ status: "all", page: 1, pageSize: 10 }, signal())).rejects.toMatchObject({ kind: "session" });
      runtime.services.dispose();
    } else {
      const transport = { request: (_path: string, init: RequestInit) => fetch(origin, init) };
      await expect(createHttpBulkRepository(transport, session, { publicReads: true }).getTemplate("CSV", signal()))
        .rejects.toMatchObject({ status: 401 });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.invalidateAccessToken).not.toHaveBeenCalled();
  });

  it("Catálogo conserva el JWT de escritura y no repite un POST", async () => {
    const { session, fetcher } = setup();
    const response = await createAuthenticatedCatalogTransport(origin, session, { publicReads: true })
      .request("/api/v1/productos", { method: "POST", headers: {}, signal: signal(), body: "{}" });
    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer test-access");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("Bulk conserva el JWT de escritura y no repite un POST", async () => {
    const { session, fetcher } = setup();
    const transport = { request: (_path: string, init: RequestInit) => fetch(origin, init) };
    await expect(createHttpBulkRepository(transport, session, { publicReads: true }).createExport("CSV", signal()))
      .rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer test-access");
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("sin sesión de entrada Catálogo no envía el GET público", async () => {
    const { session, fetcher } = setup();
    vi.mocked(session.getAccessToken).mockResolvedValue(null);
    await expect(createAuthenticatedCatalogTransport(origin, session, { publicReads: true })
      .request("/api/v1/categorias", { method: "GET", headers: {}, signal: signal() })).rejects.toThrow("Inicia sesión");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
