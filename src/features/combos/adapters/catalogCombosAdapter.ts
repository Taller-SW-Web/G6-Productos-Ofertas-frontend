import type {
  CatalogPageResult,
  CatalogRepository,
  ProductView,
  VariantDetailView,
  VariantPageResult,
} from "../../catalog/services/catalogRepository";
import type {
  CombosCatalogPort,
  ProductDetail,
  ProductSummaryPage,
  ProductSummary,
  ResolvedSku,
} from "../types/combos";

// Published commercial product types that represent a combo. Combos are their
// own domain entity (not a Catalog product), so this set is empty by default;
// it exists so a Catalog that publishes a combo type is rejected as a nested
// component without ever matching on the product *name*.
export const DEFAULT_COMBO_PRODUCT_TYPE_IDS: ReadonlySet<string> = new Set<string>();

export interface CatalogCombosAdapterOptions {
  catalog: CatalogRepository;
  comboTypeIds?: ReadonlySet<string>;
  pageSize?: number;
}

function isActiveProduct(product: ProductView): boolean {
  return product.commerciallyActive === true || product.status === "ACTIVO";
}

export class CatalogCombosAdapter implements CombosCatalogPort {
  private readonly catalog: CatalogRepository;
  private readonly comboTypeIds: ReadonlySet<string>;
  private readonly pageSize: number;

  constructor(options: CatalogCombosAdapterOptions) {
    this.catalog = options.catalog;
    this.comboTypeIds = options.comboTypeIds ?? DEFAULT_COMBO_PRODUCT_TYPE_IDS;
    this.pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 50;
  }

  async listProducts(query: string, page: number, pageSize: number, signal?: AbortSignal): Promise<ProductSummaryPage> {
    const result = await this.catalog.list(
      { q: query.trim() || undefined, status: "ACTIVO", page, pageSize },
      undefined,
      signal,
    );
    if (result.page !== page || result.pageSize !== pageSize ||
      result.items.length !== Math.min(pageSize, Math.max(0, result.total - (page - 1) * pageSize))) {
      throw new Error("Catálogo devolvió una página inconsistente de productos para Combos.");
    }
    return {
      items: result.items.filter((product) => isActiveProduct(product) && !this.isComboProduct(product)).map((product) => this.toSummary(product)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail | null> {
    const detail = await this.catalog.getById(productId, undefined, signal);
    if (!detail) return null;
    return {
      ...this.toSummary(detail),
      variants: detail.variants.map((variant) => ({
        sku: variant.sku,
        label: variant.attributesSummary ? `${variant.attributesSummary} · ${variant.sku}` : variant.sku,
        active: variant.status === "ACTIVA",
      })),
    };
  }

  async resolveSkus(skus: string[], signal?: AbortSignal): Promise<ResolvedSku[]> {
    const wanted = new Set(skus);
    if (wanted.size === 0) return [];
    const products = await this.listAllProducts(signal);
    const resolved: ResolvedSku[] = [];
    for (const product of products) {
      const isCombo = this.isComboProduct(product);
      const productActive = isActiveProduct(product);
      if (product.hasVariants) {
        if (product.skuBase && wanted.has(product.skuBase)) {
          // A variant-parent SKU is not directly sellable.
          resolved.push({
            sku: product.skuBase,
            productId: product.id,
            productName: product.name,
            isCombo,
            productActive,
            variantActive: false,
            sellable: false,
            isVariantParentSku: true,
          });
        }
        const variants = await this.listAllVariants(product.id, signal);
        for (const variant of variants) {
          if (!wanted.has(variant.sku)) continue;
          const variantActive = variant.status === "ACTIVA";
          resolved.push({
            sku: variant.sku,
            productId: product.id,
            productName: product.name,
            isCombo,
            productActive,
            variantActive,
            sellable: productActive && variantActive && !isCombo,
            isVariantParentSku: false,
          });
        }
      } else if (product.skuBase && wanted.has(product.skuBase)) {
        resolved.push({
          sku: product.skuBase,
          productId: product.id,
          productName: product.name,
          isCombo,
          productActive,
          variantActive: true,
          sellable: productActive && !isCombo,
          isVariantParentSku: false,
        });
      }
    }
    return resolved;
  }

  private toSummary(product: ProductView): ProductSummary {
    return {
      productId: product.id,
      name: product.name,
      hasVariants: product.hasVariants,
      active: isActiveProduct(product),
      baseSku: product.hasVariants ? null : product.skuBase ?? null,
      isCombo: this.isComboProduct(product),
    };
  }

  private isComboProduct(product: ProductView): boolean {
    // Identity published by Catalog: product type id. Never inferred from the name.
    return this.comboTypeIds.has(product.typeId);
  }

  private async listAllProducts(signal?: AbortSignal): Promise<ProductView[]> {
    const all: ProductView[] = [];
    const ids = new Set<string>();
    let page = 1;
    let total: number | undefined;
    for (;;) {
      const result: CatalogPageResult = await this.catalog.list(
        { page, pageSize: this.pageSize, status: "all" },
        undefined,
        signal,
      );
      if (result.page !== page || result.pageSize !== this.pageSize || (total !== undefined && total !== result.total) || result.items.length !== Math.min(this.pageSize, Math.max(0, result.total - (page - 1) * this.pageSize))) throw new Error("Catálogo devolvió una paginación incompleta de productos para Combos.");
      total = result.total;
      for (const item of result.items) {
        if (!item.id || ids.has(item.id)) throw new Error("Catálogo devolvió una identidad de producto vacía o repetida para Combos.");
        ids.add(item.id); all.push(item);
      }
      if (page >= Math.ceil(result.total / this.pageSize)) break;
      if (page >= 10_000) throw new Error("Catálogo excedió el límite defensivo de páginas para Combos.");
      page += 1;
    }
    if (all.length !== (total ?? 0)) throw new Error("Combos no obtuvo la lista completa de productos.");
    return all;
  }

  private async listAllVariants(productId: string, signal?: AbortSignal): Promise<VariantDetailView[]> {
    const all: VariantDetailView[] = [];
    const ids = new Set<string>();
    let page = 1;
    let total: number | undefined;
    for (;;) {
      const result: VariantPageResult = await this.catalog.listVariants(
        productId,
        { page, pageSize: this.pageSize, status: "all" },
        undefined,
        signal,
      );
      if (result.page !== page || result.pageSize !== this.pageSize || (total !== undefined && total !== result.total) || result.items.length !== Math.min(this.pageSize, Math.max(0, result.total - (page - 1) * this.pageSize)) || result.items.some(item => item.productId !== productId)) throw new Error("Catálogo devolvió una paginación o identidad de variante incompleta para Combos.");
      total = result.total;
      for (const item of result.items) {
        if (!item.variantId || ids.has(item.variantId)) throw new Error("Catálogo devolvió una identidad de variante vacía o repetida para Combos.");
        ids.add(item.variantId); all.push(item);
      }
      if (page >= Math.ceil(result.total / this.pageSize)) break;
      if (page >= 10_000) throw new Error("Catálogo excedió el límite defensivo de páginas de variantes para Combos.");
      page += 1;
    }
    if (all.length !== (total ?? 0)) throw new Error("Combos no obtuvo la lista completa de variantes.");
    return all;
  }
}
