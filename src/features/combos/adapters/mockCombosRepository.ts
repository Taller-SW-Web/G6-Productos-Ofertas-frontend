import { comboFixtures, priceFixtures, productDetails, productFixtures } from "../mocks/comboFixtures";
import { currentGlobalPricesForSku, effectivePublicMinor } from "../services/comboRules";
import { validateMockComboPayload } from "../services/validateMockComboPayload";
import {
  ComboError,
  type Combo,
  type ComboPayload,
  type ComboQuery,
  type CombosCatalogPort,
  type CombosPricingPort,
  type CombosRepository,
  type ProductDetail,
  type ProductSummary,
  type SkuPrice,
} from "../types/combos";

const clone = <T,>(value: T): T => structuredClone(value);

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("La consulta fue cancelada.", "AbortError");
}

export interface MockCombosOptions {
  catalog?: ProductSummary[];
  productDetails?: ProductDetail[];
  prices?: SkuPrice[];
  failProductSearches?: number;
  failVariantDetails?: string[];
}

export class MockCombosRepository implements CombosRepository, CombosCatalogPort, CombosPricingPort {
  private combos: Combo[] = clone(comboFixtures);
  private listErrorDelivered = false;
  private readonly versionConflictScenariosTriggered = new Set<string>();
  private readonly catalog: ProductSummary[];
  private readonly details: ProductDetail[];
  private readonly prices: SkuPrice[];
  private readonly failedVariantDetails: Set<string>;
  private productSearchFailuresRemaining: number;

  constructor(options: MockCombosOptions = {}) {
    this.catalog = clone(options.catalog ?? productFixtures);
    this.details = clone(options.productDetails ?? productDetails);
    this.prices = clone(options.prices ?? priceFixtures);
    this.failedVariantDetails = new Set(options.failVariantDetails ?? []);
    this.productSearchFailuresRemaining = options.failProductSearches ?? 0;
  }

  async list(query: ComboQuery, signal?: AbortSignal): Promise<{ items: Combo[]; page: number; pageSize: number; total: number }> {
    throwIfAborted(signal);
    if (query.scenario === "list-error" && !this.listErrorDelivered) {
      await Promise.resolve();
      throwIfAborted(signal);
      this.listErrorDelivered = true;
      throw new ComboError("unknown", "No se pudieron consultar los combos.");
    }
    if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1) {
      throw new ComboError("unknown", "La página solicitada no es válida.");
    }
    const all = query.scenario === "list-empty" ? [] : this.combos.filter((item) => query.status === "TODOS" || item.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    return { items: clone(all.slice(start, start + query.pageSize)), page: query.page, pageSize: query.pageSize, total: all.length };
  }

  async getById(id: string, signal?: AbortSignal): Promise<Combo | null> {
    throwIfAborted(signal);
    return clone(this.combos.find((item) => item.id === id) ?? null);
  }

  async create(payload: ComboPayload, scenario?: string): Promise<Combo> {
    if (scenario === "server-price-rejected") {
      throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    }
    validateMockComboPayload(payload, this.catalog, this.details, this.prices, this.combos.map((combo) => combo.id));
    const combo = this.buildCombo(payload, `combo-${this.combos.length + 1}`, 1, "ACTIVO");
    this.combos.unshift(combo);
    return clone(combo);
  }

  async update(id: string, payload: ComboPayload, scenario?: string): Promise<Combo> {
    let current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    if (scenario === "version-conflict" && !this.versionConflictScenariosTriggered.has(id)) {
      const concurrent = { ...clone(current), name: `${current.name} (actualizado en servidor)`, version: current.version + 1 };
      this.combos = this.combos.map((item) => item.id === id ? concurrent : item);
      this.versionConflictScenariosTriggered.add(id);
      current = concurrent;
      throw new ComboError("version_conflict", "Este combo cambió desde que comenzaste a editarlo.", clone(current));
    }
    if (payload.version !== current.version) {
      throw new ComboError("version_conflict", "Este combo cambió desde que comenzaste a editarlo.", clone(current));
    }
    if (scenario === "server-price-rejected") {
      throw new ComboError("price_invalid", "El precio del combo no cumple la regla económica.");
    }
    validateMockComboPayload(payload, this.catalog, this.details, this.prices, this.combos.map((combo) => combo.id));
    const updated = this.buildCombo(payload, current.id, current.version + 1, current.status);
    const sameComposition = current.components.length === payload.components.length &&
      current.components.every((component) => payload.components.some((proposed) =>
        proposed.sku === component.sku && proposed.quantity === component.quantity,
      ));
    updated.availability = sameComposition
      ? clone(current.availability)
      : { verifiable: false, quantity: null, freshness: "INCOMPLETA", calculatedAt: null };
    this.combos = this.combos.map((item) => item.id === id ? updated : item);
    return clone(updated);
  }

  async deactivate(id: string): Promise<Combo> {
    const current = this.combos.find((item) => item.id === id);
    if (!current) throw new ComboError("not_found", "No se encontró el combo.");
    const updated = { ...current, status: "INACTIVO" as const, version: current.version + 1 };
    this.combos = this.combos.map((item) => item.id === id ? updated : item);
    return clone(updated);
  }

  async listProducts(query: string, signal?: AbortSignal): Promise<ProductSummary[]> {
    throwIfAborted(signal);
    if (this.productSearchFailuresRemaining > 0) {
      this.productSearchFailuresRemaining -= 1;
      throw new ComboError("unavailable", "No se pudo consultar el catálogo.");
    }
    const normalized = query.trim().toLocaleLowerCase("es-PE");
    return clone(this.catalog.filter((product) => product.active && product.name.toLocaleLowerCase("es-PE").includes(normalized)));
  }

  async getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail | null> {
    throwIfAborted(signal);
    if (this.failedVariantDetails.has(productId)) {
      this.failedVariantDetails.delete(productId);
      throw new ComboError("unavailable", "No se pudo consultar el detalle de variantes.");
    }
    return clone(this.details.find((item) => item.productId === productId && item.active) ?? null);
  }

  async readCurrent(skus: string[], signal?: AbortSignal): Promise<SkuPrice[]> {
    throwIfAborted(signal);
    const now = Date.now();
    return clone(skus.flatMap((sku) => currentGlobalPricesForSku(sku, this.prices, now)));
  }

  private buildCombo(payload: ComboPayload, id: string, version: number, status: Combo["status"]): Combo {
    const components = payload.components.map((item) => {
      const product = this.catalog.find((candidate) =>
        candidate.hasVariants
          ? this.details.find((detail) => detail.productId === candidate.productId)?.variants.some((variant) => variant.sku === item.sku)
          : candidate.baseSku === item.sku,
      );
      const currentPrices = currentGlobalPricesForSku(item.sku, this.prices);
      const price = currentPrices.length === 1 ? currentPrices[0] : undefined;
      return {
        sku: item.sku,
        productName: product?.name ?? item.sku,
        quantity: item.quantity,
        regularUnitMinor: price?.regularMinor ?? null,
        publicUnitMinor: price ? effectivePublicMinor(price) : null,
      };
    });
    return {
      id,
      name: payload.name.trim(),
      description: payload.description,
      status,
      priceMinor: payload.priceMinor,
      version,
      components,
      availability: { verifiable: false, quantity: null, freshness: "INCOMPLETA", calculatedAt: null },
    };
  }
}
