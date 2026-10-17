import type { CatalogProductChoice } from "../../promotions/services/catalogRepository";
import type { PriceTarget } from "../../pricing/services/pricingRepository";
import { mockCatalogRepository } from "./mockCatalogRepository";
import { sharedMockTaxonomyRepository } from "./sharedMockTaxonomyRepository";

// Read projections of the same session store. No writes, price initialization,
// channel eligibility, barcode mapping or inventory quantities are inferred here.
export async function readMockCatalogProducts(signal: AbortSignal): Promise<CatalogProductChoice[]> {
  const products: CatalogProductChoice[] = [];
  for (let page = 1; ; page++) {
    const result = await mockCatalogRepository.list({ page, pageSize: 100 }, undefined, signal);
    for (const product of result.items) {
      const skus: CatalogProductChoice["skus"] = [];
      if (product.hasVariants) {
        for (let variantPage = 1; ; variantPage++) {
          const variants = await mockCatalogRepository.listVariants(product.id, { page: variantPage, pageSize: 100 }, undefined, signal);
          skus.push(...variants.items.map(variant => ({ sku: variant.sku,
            label: variant.identifyingAttributes.map(attribute => `${attribute.nombre}: ${attribute.valor}`).join(" · "),
            active: product.status === "ACTIVO" && variant.status === "ACTIVA",
          })));
          if (variantPage * variants.pageSize >= variants.total || !variants.items.length) break;
        }
      } else {
        skus.push({ sku: product.skuBase, label: product.name, active: product.status === "ACTIVO" });
      }
      products.push({ id: product.id, name: product.name, categoryId: product.categoryId,
        active: product.status === "ACTIVO", skus });
    }
    if (page * result.pageSize >= result.total || !result.items.length) break;
  }
  signal.throwIfAborted();
  return products;
}

export async function readMockPricingTargets(signal: AbortSignal): Promise<PriceTarget[]> {
  const targets: PriceTarget[] = [];
  for (let page = 1; ; page++) {
    const result = await mockCatalogRepository.list({ page, pageSize: 100 }, undefined, signal);
    for (const product of result.items) {
      targets.push({ id: product.id, productId: product.id, kind: "product", referenceSku: product.skuBase,
        label: `${product.name} · ${product.skuBase} · ${product.status}` });
      if (product.hasVariants) for (let variantPage = 1; ; variantPage++) {
        const variants = await mockCatalogRepository.listVariants(product.id, { page: variantPage, pageSize: 100 }, undefined, signal);
        targets.push(...variants.items.map(variant => ({ id: variant.variantId, productId: product.id,
          productTargetId: product.id, kind: "variant" as const, sku: variant.sku,
          label: `${product.name} · ${variant.sku} · ${variant.status} · Padre ${product.status}` })));
        if (variantPage * variants.pageSize >= variants.total || !variants.items.length) break;
      }
    }
    if (page * result.pageSize >= result.total || !result.items.length) break;
  }
  signal.throwIfAborted();
  return targets;
}

export async function readMockCatalogCategories(signal: AbortSignal) {
  return (await sharedMockTaxonomyRepository.getCategories(signal)).map(category => ({
    id: category.id, name: category.nombre, active: category.activo,
  }));
}
