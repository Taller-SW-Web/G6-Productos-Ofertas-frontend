import type { CatalogServices } from "../../catalog/services/catalogServices";
import type {
  CatalogProductChoice,
  PromotionCatalogRepository,
} from "../services/catalogRepository";

// Consumer adapter: read the same public ports as MK-003/004. Never own a
// second product store, infer product IDs from SKUs, or fall back to fixtures.
export function createCatalogPromotionRepository({
  catalog,
  taxonomy,
}: CatalogServices): PromotionCatalogRepository {
  return {
    async products(signal) {
      const products: CatalogProductChoice[] = [];
      for (let page = 1; ; page++) {
        signal.throwIfAborted();
        const result = await catalog.list(
          { status: "ACTIVO", page, pageSize: 100 },
          undefined,
          signal,
        );
        signal.throwIfAborted();
        for (const product of result.items) {
          if (product.status !== "ACTIVO") continue;
          const skus: CatalogProductChoice["skus"] = [];
          if (product.hasVariants) {
            for (let variantPage = 1; ; variantPage++) {
              const variants = await catalog.listVariants(
                product.id,
                { status: "ACTIVA", page: variantPage, pageSize: 100 },
                undefined,
                signal,
              );
              signal.throwIfAborted();
              skus.push(
                ...variants.items
                  .filter((row) => row.status === "ACTIVA")
                  .map((row) => ({
                    sku: row.sku,
                    label:
                      row.identifyingAttributes
                        .map((attribute) => `${attribute.nombre}: ${attribute.valor}`)
                        .join(" · ") || row.sku,
                    active: true,
                  })),
              );
              if (variants.page * variants.pageSize >= variants.total) break;
              if (!variants.items.length || variants.page !== variantPage)
                throw new Error(
                  "No se pudo completar la consulta de variantes de Catálogo.",
                );
            }
          } else {
            // Catalog explicitly defines skuBase as the sellable SKU for simple products.
            skus.push({ sku: product.skuBase, label: product.name, active: true });
          }
          products.push({
            id: product.id,
            name: product.name,
            active: true,
            categoryId: product.categoryId,
            skus,
          });
        }
        if (result.page * result.pageSize >= result.total) break;
        if (!result.items.length || result.page !== page)
          throw new Error(
            "No se pudo completar la consulta de productos de Catálogo.",
          );
      }
      return products;
    },
    async categories(signal) {
      signal.throwIfAborted();
      const rows = await taxonomy.getCategories(signal);
      signal.throwIfAborted();
      return rows
        .filter((row) => row.activo)
        .map((row) => ({ id: row.id, name: row.nombre, active: true }));
    },
  };
}
