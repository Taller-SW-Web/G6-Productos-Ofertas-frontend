import { describe, expect, it } from "vitest";
import { createHttpCatalogRepository } from "../adapters/httpCatalogRepository";
import { listVariantsByProduct } from "../../inventory/adapters/catalogSkuSnapshot";

describe("INV-05 / PRI-04 / PRO-01 selección acotada por endpoint existente", () => {
  it("conserva 240 SKU y reduce 80 a 40 lecturas sin preparación ni características en selección", async () => {
    const calls: string[] = [];
    const products = Array.from({ length: 40 }, (_, index) => ({ id: `producto-${index}` }));
    const catalog = createHttpCatalogRepository({ request: async path => {
      calls.push(path);
      const id = /\/productos\/([^/]+)\//.exec(path)?.[1];
      const items = Array.from({ length: 6 }, (_, index) => ({ variant_id: `${id}-${index}`, sku: `SKU-${id}-${index}`, status: "ACTIVA" }));
      return path.endsWith("/preparacion") ? Response.json({ product_id: id, tiene_variantes: true, pricing: { status: "COMPLETED", manual_retry_allowed: false }, inventario: null,
        variantes: items.map(item => ({ ...item, inventario: { status: "COMPLETED", manual_retry_allowed: false } })) }) :
        Response.json({ items, meta: { pagina: 1, tamanio: 100, total: 6, totalPaginas: 1 } });
    } });
    const baseline = await listVariantsByProduct({ ...catalog, listVariantIdentities: undefined }, products, 100);
    expect(calls).toHaveLength(80);
    calls.length = 0;
    const selected = await listVariantsByProduct(catalog, products, 100);
    expect(calls).toHaveLength(40);
    expect(calls.every(path => path.includes("/variantes?"))).toBe(true);
    expect([...selected.values()].flat().map(row => row.sku)).toEqual([...baseline.values()].flat().map(row => row.sku));
    expect([...selected.values()].flat()).toHaveLength(240);
  });
});
