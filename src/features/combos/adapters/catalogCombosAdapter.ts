import type { CatalogRepository, ProductView } from "../../catalog/services/catalogRepository";
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
const SKU_RESOLUTION_CACHE_MS = 30_000;
const SKU_RESOLUTION_CACHE_MAX = 500;
const MOCK_REFRESH_CONCURRENCY = 8;

export interface CatalogCombosAdapterOptions {
  catalog: CatalogRepository;
  comboTypeIds?: ReadonlySet<string>;
  pageSize?: number;
  /** Local fixture support only. Never enable with an HTTP CatalogRepository. */
  allowMockCatalogScan?: boolean;
}

function isActiveProduct(product: ProductView): boolean {
  return product.commerciallyActive === true || product.status === "ACTIVO";
}

export class CatalogCombosAdapter implements CombosCatalogPort {
  private readonly catalog: CatalogRepository;
  private readonly comboTypeIds: ReadonlySet<string>;
  private readonly pageSize: number;
  private readonly allowMockCatalogScan: boolean;
  private readonly skuIndexCache = new Map<string, { resolved: ResolvedSku; expiresAt: number }>();
  private mockCatalogChanged = false;

  constructor(options: CatalogCombosAdapterOptions) {
    this.catalog = options.catalog;
    this.comboTypeIds = options.comboTypeIds ?? DEFAULT_COMBO_PRODUCT_TYPE_IDS;
    this.pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 50;
    this.allowMockCatalogScan = options.allowMockCatalogScan === true;
    if (this.allowMockCatalogScan) {
      const observable = this.catalog as CatalogRepository & { subscribe?: (listener: () => void) => () => void };
      observable.subscribe?.(() => { this.mockCatalogChanged = true; });
    }
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
    const items = result.items.map((product) => this.toSummary(product));
    result.items.forEach((product) => this.cacheProductSummary(product));
    return {
      // Keep the exact server page and total aligned. Combo types cannot be
      // excluded until the provider publishes that filter.
      items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail | null> {
    const detail = await this.catalog.getById(productId, undefined, signal);
    if (!detail) return null;
    this.cacheProductDetail(detail);
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
    signal?.throwIfAborted();
    const requested = [...new Set(skus)];
    if (this.allowMockCatalogScan && this.mockCatalogChanged) await this.refreshObservedMockProducts(signal);
    const cached = this.peekResolvedSkus(requested);
    if (cached.length === requested.length || !this.allowMockCatalogScan) return cached;
    const known = new Map(cached.map((item) => [item.sku, item]));
    for (const product of await this.readMockCatalog(signal)) {
      signal?.throwIfAborted();
      const combo = this.isComboProduct(product);
      const active = isActiveProduct(product);
      const add = (sku: string, variantActive: boolean, isVariantParentSku: boolean) => {
        if (!requested.includes(sku)) return;
        const resolved: ResolvedSku = { sku, productId: product.id, productName: product.name, isCombo: combo, productActive: active, variantActive, sellable: active && variantActive && !combo && !isVariantParentSku, isVariantParentSku };
        known.set(sku, resolved); this.cache(resolved);
      };
      if (product.skuBase) add(product.skuBase, !product.hasVariants, product.hasVariants);
      if (product.hasVariants) {
        const detail = await this.catalog.getById(product.id, undefined, signal);
        if (detail) for (const variant of detail.variants) add(variant.sku, variant.status === "ACTIVA", false);
      }
    }
    return requested.flatMap((sku) => known.has(sku) ? [known.get(sku)!] : []);
  }

  private async readMockCatalog(signal?: AbortSignal): Promise<ProductView[]> {
    const items: ProductView[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (items.length < total) {
      signal?.throwIfAborted();
      const result = await this.catalog.list({ page, pageSize: this.pageSize, status: "all" }, undefined, signal);
      if (result.page !== page || result.pageSize !== this.pageSize || result.items.length !== Math.min(this.pageSize, Math.max(0, result.total - (page - 1) * this.pageSize))) throw new Error("La resolución mock de SKU recibió una página inconsistente.");
      total = result.total; items.push(...result.items); page += 1;
      if (page > 10_000) throw new Error("La resolución mock excedió el límite defensivo de páginas.");
    }
    return items;
  }

  peekResolvedSkus(skus: string[]): ResolvedSku[] {
    this.pruneSkuCache();
    if (this.mockCatalogChanged) return [];
    return [...new Set(skus)].flatMap((sku) => {
      const cached = this.skuIndexCache.get(sku);
      return cached ? [cached.resolved] : [];
    });
  }

  private cache(resolved: ResolvedSku): void {
    this.pruneSkuCache();
    this.skuIndexCache.delete(resolved.sku);
    this.skuIndexCache.set(resolved.sku, { resolved, expiresAt: Date.now() + SKU_RESOLUTION_CACHE_MS });
    while (this.skuIndexCache.size > SKU_RESOLUTION_CACHE_MAX) {
      const oldest = this.skuIndexCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.skuIndexCache.delete(oldest);
    }
  }

  private pruneSkuCache(): void {
    const now = Date.now();
    for (const [sku, entry] of this.skuIndexCache) if (entry.expiresAt <= now) this.skuIndexCache.delete(sku);
  }

  private cacheProductSummary(product: ProductView): void {
    if (product.hasVariants || !product.skuBase) return;
    const isCombo = this.isComboProduct(product);
    const productActive = isActiveProduct(product);
    this.cache({ sku: product.skuBase, productId: product.id, productName: product.name, isCombo, productActive, variantActive: true, sellable: productActive && !isCombo, isVariantParentSku: false });
  }

  private cacheProductDetail(product: ProductView & { variants: readonly { sku: string; status: string }[] }): void {
    this.invalidateProductCache(product.id);
    const isCombo = this.isComboProduct(product);
    const productActive = isActiveProduct(product);
    if (product.hasVariants && product.skuBase) this.cache({ sku: product.skuBase, productId: product.id, productName: product.name, isCombo, productActive, variantActive: false, sellable: false, isVariantParentSku: true });
    if (!product.hasVariants && product.skuBase) this.cache({ sku: product.skuBase, productId: product.id, productName: product.name, isCombo, productActive, variantActive: true, sellable: productActive && !isCombo, isVariantParentSku: false });
    for (const variant of product.variants) {
      const variantActive = variant.status === "ACTIVA";
      this.cache({ sku: variant.sku, productId: product.id, productName: product.name, isCombo, productActive, variantActive, sellable: productActive && variantActive && !isCombo, isVariantParentSku: false });
    }
  }

  private async refreshObservedMockProducts(signal?: AbortSignal): Promise<void> {
    const productIds = [...new Set([...this.skuIndexCache.values()].map((entry) => entry.resolved.productId))];
    for (let offset = 0; offset < productIds.length; offset += MOCK_REFRESH_CONCURRENCY) {
      signal?.throwIfAborted();
      const ids = productIds.slice(offset, offset + MOCK_REFRESH_CONCURRENCY);
      const details = await Promise.all(ids.map((id) => this.catalog.getById(id, undefined, signal)));
      details.forEach((detail, index) => {
        if (detail) this.cacheProductDetail(detail);
        else this.invalidateProductCache(ids[index]!);
      });
    }
    this.mockCatalogChanged = false;
  }

  private invalidateProductCache(productId: string): void {
    for (const [sku, entry] of this.skuIndexCache) {
      if (entry.resolved.productId === productId) this.skuIndexCache.delete(sku);
    }
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

}
