import { afterEach, expect, it, vi } from "vitest";
import { createInventoryCatalogResolver } from "./catalogMetadataResolver";
import { getCatalogServices } from "../../catalog/services/catalogServices";
import { initialProducts } from "../../catalog/mocks/catalogFixtures";
import type { ComboSkuResolution } from "../../catalog/services/catalogRepository";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const base = getCatalogServices("mock");
  const products = Array.from({ length: 40 }, (_, i) => ({ ...initialProducts[0]!, id: `p-${i}`, name: `Producto ${i}`, status: i === 0 ? "INACTIVO" as const : "ACTIVO" as const }));
  const skus = Array.from({ length: 240 }, (_, i) => `000-SKU/${i}`);
  const bySku = new Map(skus.map((sku, i) => [sku, products[Math.floor(i / 6)]!]));
  const list = vi.fn(async () => ({ items: products, page: 1, pageSize: 100, total: 40 }));
  const resolveComboSkus = vi.fn(async (batch: readonly string[]): Promise<ComboSkuResolution[]> => batch.map(sku => {
    const product = bySku.get(sku)!;
    return { sku, resultado: product.status === "INACTIVO" ? "INACTIVO" : "ELEGIBLE", productId: product.id, nombre: product.name,
      productoPadre: { productId: product.id, nombre: product.name, estado: product.status, tieneVariantes: true },
      variante: { variantId: `variant-${sku}`, estado: "ACTIVA" }, estado: "ACTIVA", tipoProductoId: product.typeId };
  }));
  const listVariants = vi.fn();
  const services = { ...base, catalog: { ...base.catalog, list, resolveComboSkus, listVariants } };
  return { services, list, resolveComboSkus, listVariants, skus };
}

it("INV-01/05 resuelve 240 SKU en 3 lotes + 1 página sin variantes, incluidos productos inactivos", async () => {
  const f = fixture();
  const resolve = createInventoryCatalogResolver(f.services, () => "user-a");
  const rows = await resolve([...f.skus, f.skus[0]!]);
  expect(rows).toHaveLength(240);
  expect(rows.map(row => row.sku)).toEqual(f.skus);
  expect(rows[0]?.productName).toBe("Producto 0");
  expect(f.resolveComboSkus).toHaveBeenCalledTimes(3);
  expect(f.resolveComboSkus.mock.calls.every(([batch]) => batch.length <= 100)).toBe(true);
  expect(f.list).toHaveBeenCalledTimes(1);
  expect(f.listVariants).not.toHaveBeenCalled();
  await resolve([f.skus[0]!]);
  expect(f.list).toHaveBeenCalledTimes(1);
});

it("no mezcla caché entre usuarios y rechaza una respuesta de la identidad anterior", async () => {
  const f = fixture();
  let owner = "user-a";
  const resolve = createInventoryCatalogResolver(f.services, () => owner);
  await resolve([f.skus[0]!]);
  owner = "user-b";
  await resolve([f.skus[0]!]);
  expect(f.list).toHaveBeenCalledTimes(2);
  f.resolveComboSkus.mockImplementationOnce(async () => { owner = "user-c"; return []; });
  await expect(resolve([f.skus[0]!])).rejects.toThrow();
});
