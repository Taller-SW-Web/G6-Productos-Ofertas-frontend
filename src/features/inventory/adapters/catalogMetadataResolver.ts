import type { CatalogServices } from "../../catalog/services/catalogServices";
import type { ProductView } from "../../catalog/services/catalogRepository";
import type { InventoryCatalogSku } from "./apiInventoryAdapter";

// Uses only the existing human-authenticated SKU resolver and paginated product
// summaries. Never enumerates variants, preparation or characteristic schemas.
export function createInventoryCatalogResolver(services: CatalogServices, owner: () => string | null) {
  type Metadata = { products: Map<string, ProductView>; categories: Map<string, string>; brands: Map<string, string> };
  const cache = new Map<string, { value: Metadata; at: number }>();
  const loads = new Map<string, Promise<Metadata>>();
  function assertOwner(identity: string) {
    if (owner() !== identity) throw new Error("La sesión cambió durante la consulta de Catálogo.");
  }
  async function metadata(identity: string): Promise<Metadata> {
    const existing = cache.get(identity);
    if (existing && Date.now() - existing.at < 30_000) return existing.value;
    let pending = loads.get(identity);
    if (!pending) {
      pending = (async () => {
        const signal = AbortSignal.timeout(20_000);
        const [categories, brands] = await Promise.all([
          services.taxonomy.getCategories(signal), services.taxonomy.getBrands(signal),
        ]);
        const products = new Map<string, ProductView>();
        let total: number | undefined;
        for (let page = 1; ; page++) {
          signal.throwIfAborted();
          const result = await services.catalog.list({ status: "all", page, pageSize: 100 }, undefined, signal);
          if (page > 1000 || result.page !== page || result.pageSize !== 100 ||
            (total !== undefined && result.total !== total) ||
            result.items.length !== Math.min(100, Math.max(0, result.total - (page - 1) * 100)))
            throw new Error("La paginación de metadatos de Catálogo está incompleta.");
          total = result.total;
          for (const product of result.items) {
            if (products.has(product.id)) throw new Error("Catálogo repitió una identidad de producto.");
            products.set(product.id, product);
          }
          if (products.size >= total) break;
        }
        assertOwner(identity);
        const value = { products, categories: new Map(categories.map(row => [row.id, row.nombre])), brands: new Map(brands.map(row => [row.id, row.nombre])) };
        cache.set(identity, { value, at: Date.now() });
        return value;
      })();
      loads.set(identity, pending);
      void pending.finally(() => loads.delete(identity)).catch(() => undefined);
    }
    return pending;
  }
  return async (skus: readonly string[], signal?: AbortSignal): Promise<InventoryCatalogSku[]> => {
    signal?.throwIfAborted();
    if (!skus.length) return [];
    const identity = owner();
    if (!identity) throw new Error("Inicia sesión para consultar Catálogo.");
    if (!services.catalog.resolveComboSkus) throw new Error("La resolución administrativa de SKU no está configurada.");
    const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)]);
    const requested = [...new Set(skus)];
    const resolved: Awaited<ReturnType<NonNullable<typeof services.catalog.resolveComboSkus>>> = [];
    const [context] = await Promise.all([
      metadata(identity),
      (async () => {
        for (let offset = 0; offset < requested.length; offset += 100) {
          bounded.throwIfAborted();
          const batch = requested.slice(offset, offset + 100);
          const rows = await services.catalog.resolveComboSkus!(batch, bounded);
          if (rows.length !== batch.length || rows.some((row, index) => row.sku !== batch[index]))
            throw new Error("Catálogo devolvió identidades SKU incompletas o reordenadas.");
          resolved.push(...rows);
        }
      })(),
    ]);
    bounded.throwIfAborted();
    assertOwner(identity);
    return resolved.flatMap(row => {
      if (!row.productId || row.resultado === "NO_ENCONTRADO") return [];
      const product = context.products.get(row.productId);
      if (!product) return [];
      // Inactive/historical identities still decorate authoritative stock.
      return [{ sku: row.sku, productName: row.nombre ?? product.name,
        categoryId: product.categoryId, categoryName: context.categories.get(product.categoryId) ?? "Categoría no disponible",
        brandId: product.brandId, brandName: context.brands.get(product.brandId) ?? "Marca no disponible" }];
    });
  };
}
