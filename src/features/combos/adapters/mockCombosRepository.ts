import type {
  ComboListQuery,
  ComboPageResult,
  ComboView,
  CreateComboPayload,
  UpdateComboPayload,
  ComponentPricingSnapshot,
  FreshnessStatus,
} from "../types/combos";
import {
  ComboRepositoryError,
  type CombosRepository,
} from "../services/combosRepository";
import {
  initialCombos,
  initialPricingCatalog,
  catalogCandidateProducts,
  initialInventorySnapshot,
} from "../mocks/combosFixtures";
import { initialProducts } from "../../catalog/mocks/catalogFixtures";
import { evaluateComboEconomicBenefit } from "../utils/economicEvaluation";

export { evaluateComboEconomicBenefit };

/**
 * Calculates informative inventory availability per SPEC-002:
 * min(floor(stockDisponibleSKU / cantidadRequerida))
 *
 * If any SKU has null or unconfirmed stock, returns null availability with INCOMPLETA freshness.
 * If any component has 0 stock (min = 0), returns 0 with ACTUALIZADA freshness (Agotado).
 * If all have sufficient stock, returns the min units available with ACTUALIZADA freshness.
 */
export function calculateComboAvailability(
  components: { sku: string; quantity: number }[],
  stockSnapshot: Record<string, number | null>,
): {
  informativeAvailability: number | null;
  freshness: FreshnessStatus;
} {
  let minAvail = Infinity;
  for (const c of components) {
    const stock = stockSnapshot[c.sku];
    if (stock === undefined || stock === null) {
      return {
        informativeAvailability: null,
        freshness: "INCOMPLETA",
      };
    }
    if (c.quantity <= 0) continue;
    const units = Math.floor(stock / c.quantity);
    if (units < minAvail) {
      minAvail = units;
    }
  }

  if (minAvail === Infinity) {
    return {
      informativeAvailability: null,
      freshness: "NO_VERIFICABLE",
    };
  }

  return {
    informativeAvailability: minAvail,
    freshness: "ACTUALIZADA",
  };
}

export interface CatalogSkuResolution {
  found: boolean;
  productName: string;
  variantLabel?: string;
  isActive: boolean;
  isNestedCombo: boolean;
  isVariantParentWithoutSelection?: boolean;
}

export function resolveCatalogSku(sku: string): CatalogSkuResolution {
  // Check candidate products
  for (const p of catalogCandidateProducts) {
    const isComboType =
      Boolean(p.typeName?.toLowerCase().includes("combo")) ||
      Boolean(p.typeId?.toLowerCase().includes("combo")) ||
      p.name.toLowerCase().startsWith("combo ");

    if (!p.hasVariants) {
      if (p.skuBase === sku) {
        return {
          found: true,
          productName: p.name,
          isActive: p.status === "ACTIVO",
          isNestedCombo: isComboType,
        };
      }
    } else {
      if (p.skuBase === sku) {
        return {
          found: true,
          productName: p.name,
          isActive: p.status === "ACTIVO",
          isNestedCombo: isComboType,
          isVariantParentWithoutSelection: true,
        };
      }
      const v = p.variants.find((vr) => vr.sku === sku);
      if (v) {
        return {
          found: true,
          productName: p.name,
          variantLabel: v.label,
          isActive: p.status === "ACTIVO" && v.status === "ACTIVA",
          isNestedCombo: isComboType,
        };
      }
    }
  }

  // Check shared Catalog fixtures
  for (const cp of initialProducts) {
    const isComboType =
      Boolean(cp.typeName?.toLowerCase().includes("combo")) ||
      Boolean(cp.typeId?.toLowerCase().includes("combo")) ||
      cp.name.toLowerCase().startsWith("combo ");

    if (!cp.hasVariants) {
      if (cp.skuBase === sku) {
        return {
          found: true,
          productName: cp.name,
          isActive: cp.status === "ACTIVO",
          isNestedCombo: isComboType,
        };
      }
    } else {
      if (cp.skuBase === sku) {
        return {
          found: true,
          productName: cp.name,
          isActive: cp.status === "ACTIVO",
          isNestedCombo: isComboType,
          isVariantParentWithoutSelection: true,
        };
      }
      const v = cp.variants.find((vr) => vr.sku === sku);
      if (v) {
        return {
          found: true,
          productName: cp.name,
          variantLabel: v.attributesSummary,
          isActive: cp.status === "ACTIVO" && v.status === "ACTIVA",
          isNestedCombo: isComboType,
        };
      }
    }
  }

  return {
    found: false,
    productName: "",
    isActive: false,
    isNestedCombo: false,
  };
}

export class MockCombosRepository implements CombosRepository {
  private combos: ComboView[];
  private pricing: Record<string, ComponentPricingSnapshot>;
  private stockSnapshot: Record<string, number | null>;
  private nextId = 100;

  // Failure simulation flags for testing negative scenarios
  private pricingFailure = false;
  private listFailure = false;

  constructor(customCombos?: ComboView[]) {
    this.combos = (customCombos ?? initialCombos).map((c) => ({
      ...c,
      components: c.components.map((comp) => ({ ...comp })),
    }));
    this.pricing = { ...initialPricingCatalog };
    this.stockSnapshot = { ...initialInventorySnapshot };
  }

  public reset(customCombos?: ComboView[]): void {
    this.combos = (customCombos ?? initialCombos).map((c) => ({
      ...c,
      components: c.components.map((comp) => ({ ...comp })),
    }));
    this.pricing = { ...initialPricingCatalog };
    this.stockSnapshot = { ...initialInventorySnapshot };
    this.nextId = 100;
    this.pricingFailure = false;
    this.listFailure = false;
  }

  public setPricingFailure(fail: boolean): void {
    this.pricingFailure = fail;
  }

  public setListFailure(fail: boolean): void {
    this.listFailure = fail;
  }

  public setStockForSku(sku: string, stock: number | null): void {
    this.stockSnapshot[sku] = stock;
  }

  async listCombos(query: ComboListQuery, scenario?: string): Promise<ComboPageResult> {
    if (this.listFailure || scenario === "list-error" || scenario === "error") {
      throw new ComboRepositoryError(
        "ERROR_INTERNO",
        "Error al cargar el listado de combos.",
      );
    }

    if (scenario === "list-empty" || scenario === "empty") {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: query.pageSize || 10,
      };
    }

    let filtered = [...this.combos];

    if (query.status && query.status !== "all") {
      filtered = filtered.filter((c) => c.status === query.status);
    }

    const total = filtered.length;
    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paged = filtered.slice(start, end);

    return {
      items: paged.map((c) => ({
        comboId: c.comboId,
        name: c.name,
        price: c.price,
        componentsCount: c.components.length,
        status: c.status,
        informativeAvailability: c.informativeAvailability,
        freshness: c.freshness,
        version: c.version,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getCombo(comboId: string, scenario?: string): Promise<ComboView | null> {
    if (scenario === "not-found" || scenario === "missing") {
      return null;
    }
    const found = this.combos.find((c) => c.comboId === comboId);
    if (!found) return null;
    return {
      ...found,
      components: found.components.map((comp) => ({ ...comp })),
    };
  }

  private validatePayloadComponents(
    components: { sku: string; quantity: number }[],
  ): CatalogSkuResolution[] {
    if (!components || components.length < 2) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTES_INSUFICIENTES",
        "Un combo debe contener al menos dos componentes SKU vendibles directos.",
      );
    }

    const skus = components.map((c) => c.sku);
    const uniqueSkus = new Set(skus);
    if (uniqueSkus.size !== skus.length) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTE_DUPLICADO",
        "No se permiten componentes duplicados dentro del mismo combo.",
      );
    }

    const resolutions: CatalogSkuResolution[] = [];

    for (const comp of components) {
      // Validate quantity integrity: positive safe integer >= 1
      if (!Number.isSafeInteger(comp.quantity) || comp.quantity < 1) {
        throw new ComboRepositoryError(
          "CANTIDAD_INVALIDA",
          `La cantidad del SKU ${comp.sku} debe ser un entero positivo seguro mayor o igual a 1.`,
        );
      }

      // Catalog SKU eligibility verification
      const res = resolveCatalogSku(comp.sku);
      if (!res.found) {
        throw new ComboRepositoryError(
          "SKU_NO_ENCONTRADO",
          `El SKU '${comp.sku}' no existe en el catálogo.`,
        );
      }
      if (res.isNestedCombo) {
        throw new ComboRepositoryError(
          "COMBO_ANIDADO_NO_PERMITIDO",
          `El SKU '${comp.sku}' corresponde a un combo. No se admiten combos anidados como componentes.`,
        );
      }
      if (res.isVariantParentWithoutSelection) {
        throw new ComboRepositoryError(
          "SKU_NO_ELEGIBLE",
          `El producto '${res.productName}' posee variantes; debe seleccionarse una variante vendible específica, no el SKU base.`,
        );
      }
      if (!res.isActive) {
        throw new ComboRepositoryError(
          "SKU_NO_ELEGIBLE",
          `El SKU '${comp.sku}' pertenece a un producto o variante inactivo/no vendible.`,
        );
      }

      resolutions.push(res);
    }

    return resolutions;
  }

  async createCombo(payload: CreateComboPayload): Promise<ComboView> {
    if (!payload.nombre || payload.nombre.trim() === "") {
      throw new ComboRepositoryError("ERROR_INTERNO", "El nombre del combo es obligatorio.");
    }

    const resolutions = this.validatePayloadComponents(payload.componentes);

    // Economic evaluation
    const economic = evaluateComboEconomicBenefit(
      payload.componentes,
      payload.precioCombo,
      this.pricing,
    );

    if (!economic.isValidBenefit) {
      throw new ComboRepositoryError(
        "COMBO_PRECIO_INVALIDO",
        economic.message ||
          "El precio del combo debe ser estrictamente menor que la suma regular y que la suma pública vigente de sus componentes.",
      );
    }

    // Availability calculated deterministically from stock snapshot (never hardcoded 10)
    const availability = calculateComboAvailability(
      payload.componentes,
      this.stockSnapshot,
    );

    const newId = `combo-${++this.nextId}`;

    const newCombo: ComboView = {
      comboId: newId,
      name: payload.nombre.trim(),
      description: payload.descripcion ? payload.descripcion.trim() : null,
      status: "ACTIVO",
      price: payload.precioCombo,
      components: payload.componentes.map((comp, idx) => {
        const pr = this.pricing[comp.sku];
        const res = resolutions[idx]!;
        return {
          sku: comp.sku,
          quantity: comp.quantity,
          productName: res.productName,
          variantLabel: res.variantLabel,
          regularPrice: pr?.regularPrice ?? 0,
          publicPrice: pr?.publicPrice ?? 0,
          currency: pr?.currency ?? "PEN",
        };
      }),
      informativeAvailability: availability.informativeAvailability,
      calculatedAt: new Date().toISOString(),
      freshness: availability.freshness,
      version: 1,
    };

    this.combos.unshift(newCombo);
    return { ...newCombo };
  }

  async updateCombo(
    comboId: string,
    payload: UpdateComboPayload,
    scenario?: string,
  ): Promise<ComboView> {
    const existingIndex = this.combos.findIndex((c) => c.comboId === comboId);
    if (existingIndex === -1) {
      throw new ComboRepositoryError(
        "COMBO_NO_ENCONTRADO",
        `No se encontró el combo con identificador ${comboId}`,
      );
    }

    const current = this.combos[existingIndex]!;

    // Concurrency check or simulated conflict scenario
    if (scenario === "version-conflict" || scenario === "conflict") {
      current.version += 1;
      current.name = `${current.name} (Modificado externamente)`;
      current.price = Math.round((current.price + 10) * 100) / 100;
      throw new ComboRepositoryError(
        "VERSION_CONFLICT",
        "Este combo cambió desde que comenzaste a editarlo. Revisa la versión actual antes de volver a guardar tus cambios.",
        current.version,
      );
    }

    if (payload.version !== current.version) {
      throw new ComboRepositoryError(
        "VERSION_CONFLICT",
        "Este combo cambió desde que comenzaste a editarlo. Revisa la versión actual antes de volver a guardar tus cambios.",
        current.version,
      );
    }

    if (!payload.nombre || payload.nombre.trim() === "") {
      throw new ComboRepositoryError("ERROR_INTERNO", "El nombre del combo es obligatorio.");
    }

    const resolutions = this.validatePayloadComponents(payload.componentes);

    // Economic evaluation
    const economic = evaluateComboEconomicBenefit(
      payload.componentes,
      payload.precioCombo,
      this.pricing,
    );

    if (!economic.isValidBenefit) {
      throw new ComboRepositoryError(
        "COMBO_PRECIO_INVALIDO",
        economic.message ||
          "El precio del combo debe ser estrictamente menor que la suma regular y que la suma pública vigente de sus componentes.",
      );
    }

    // Availability recalculated dynamically on update (never reusing stale estimate)
    const availability = calculateComboAvailability(
      payload.componentes,
      this.stockSnapshot,
    );

    const updated: ComboView = {
      ...current,
      name: payload.nombre.trim(),
      description: payload.descripcion ? payload.descripcion.trim() : null,
      price: payload.precioCombo,
      version: current.version + 1,
      components: payload.componentes.map((comp, idx) => {
        const pr = this.pricing[comp.sku];
        const res = resolutions[idx]!;
        return {
          sku: comp.sku,
          quantity: comp.quantity,
          productName: res.productName,
          variantLabel: res.variantLabel,
          regularPrice: pr?.regularPrice ?? 0,
          publicPrice: pr?.publicPrice ?? 0,
          currency: pr?.currency ?? "PEN",
        };
      }),
      informativeAvailability: availability.informativeAvailability,
      freshness: availability.freshness,
      calculatedAt: new Date().toISOString(),
    };

    this.combos[existingIndex] = updated;
    return { ...updated };
  }

  async deactivateCombo(comboId: string): Promise<ComboView> {
    const existingIndex = this.combos.findIndex((c) => c.comboId === comboId);
    if (existingIndex === -1) {
      throw new ComboRepositoryError(
        "COMBO_NO_ENCONTRADO",
        `No se encontró el combo con identificador ${comboId}`,
      );
    }

    const current = this.combos[existingIndex]!;
    if (current.status === "INACTIVO") {
      return { ...current };
    }

    const updated: ComboView = {
      ...current,
      status: "INACTIVO",
      version: current.version + 1,
    };

    this.combos[existingIndex] = updated;
    return { ...updated };
  }

  async getComponentsPricing(
    skus: string[],
    scenario?: string,
  ): Promise<Record<string, ComponentPricingSnapshot>> {
    if (this.pricingFailure || scenario === "pricing-error") {
      throw new ComboRepositoryError(
        "SERVICIO_NO_DISPONIBLE",
        "Error al consultar el servicio de precios de componentes.",
      );
    }

    const result: Record<string, ComponentPricingSnapshot> = {};
    for (const sku of skus) {
      if (this.pricing[sku]) {
        result[sku] = { ...this.pricing[sku] };
      } else {
        result[sku] = {
          sku,
          regularPrice: 0,
          publicPrice: 0,
          currency: "PEN",
          available: false,
        };
      }
    }
    return result;
  }
}

export const mockCombosRepository = new MockCombosRepository();
