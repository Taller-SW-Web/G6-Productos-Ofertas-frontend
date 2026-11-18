import { describe, expect, it, vi } from "vitest";

import type { CatalogRepository } from "../../catalog/services/catalogRepository";
import type { CatalogHttpTransport } from "../../catalog/adapters/catalogHttp";
import { createHttpCatalogRepository } from "../../catalog/adapters/httpCatalogRepository";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Catálogo HTTP: filtros de Combos y resolución SKU por lote", () => {
  it("envía todos los tipos excluidos al servidor antes de paginar", async () => {
    const request = vi.fn(
      async (
        path: string,
        init: {
          method: string;
          signal: AbortSignal;
          headers: Record<string, string>;
          body?: string;
        },
      ) => {
        void path;
        void init;
        return response({
          items: [],
          meta: { total: 0, pagina: 1, tamanio: 25, totalPaginas: 0 },
        });
      },
    );
    const repository = createHttpCatalogRepository({
      request,
    } as unknown as CatalogHttpTransport);
    await repository.list({
      page: 1,
      pageSize: 25,
      typeIdsExcluded: ["tipo-combo-a", "tipo-combo-b"],
    });
    const url = new URL(
      request.mock.calls[0]![0] as string,
      "https://catalog.test",
    );
    expect(url.pathname).toBe("/api/v1/productos/administracion");
    expect(url.searchParams.getAll("tipoProductoIdsExcluidos")).toEqual([
      "tipo-combo-a",
      "tipo-combo-b",
    ]);
  });

  it("mantiene SKU opacos, duplicados, estado y variante recibidos del provider", async () => {
    const sku = "000/A, SKU+ñ";
    const request = vi.fn(
      async (_path: string, init: { method: string; body?: string }) => {
        expect(init.method).toBe("POST_READ");
        expect(JSON.parse(init.body ?? "{}").skus).toEqual([sku, sku]);
        return response({
          items: [0, 1].map(() => ({
            sku,
            resultado: "ELEGIBLE",
            productId: "prod-1",
            nombre: "Base",
            productoPadre: {
              productId: "prod-1",
              nombre: "Base",
              tieneVariantes: true,
              estado: "ACTIVO",
            },
            variante: { variantId: "var-1", estado: "ACTIVA" },
            estado: "ACTIVA",
            tipoProductoId: "tipo-1",
          })),
        });
      },
    );
    const repository = createHttpCatalogRepository({
      request,
    } as unknown as CatalogHttpTransport);
    const result = await (repository as CatalogRepository).resolveComboSkus!([
      sku,
      sku,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sku,
      resultado: "ELEGIBLE",
      variante: { variantId: "var-1", estado: "ACTIVA" },
    });
  });

  it.each([401, 403, 503])(
    "preserva el error HTTP %i sin repetir la consulta POST de solo lectura",
    async (status) => {
      const request = vi.fn(async () =>
        response({ code: "ERROR_HTTP" }, status),
      );
      const repository = createHttpCatalogRepository({
        request,
      } as unknown as CatalogHttpTransport);
      await expect(
        (repository as CatalogRepository).resolveComboSkus!(["SKU-1"]),
      ).rejects.toMatchObject({ details: { status: String(status) } });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
});
