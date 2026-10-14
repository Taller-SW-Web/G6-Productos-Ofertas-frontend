import type {
  ComboListQuery,
  ComboPageResult,
  ComboView,
  CreateComboPayload,
  UpdateComboPayload,
  ComponentPricingSnapshot,
  EconomicComparisonResult,
} from "../types/combos";
import {
  ComboRepositoryError,
  type CombosRepository,
} from "../services/combosRepository";
import {
  initialCombos,
  initialPricingCatalog,
  catalogCandidateProducts,
} from "../mocks/combosFixtures";

export function evaluateComboEconomicBenefit(
  components: { sku: string; quantity: number }[],
  comboPrice: number,
  pricingMap: Record<string, ComponentPricingSnapshot>,
): EconomicComparisonResult {
  let regularSum = 0;
  let publicSum = 0;
  let isPricingComplete = true;
  let currency = "PEN";

  for (const comp of components) {
    const pricing = pricingMap[comp.sku];
    if (!pricing || !pricing.available) {
      isPricingComplete = false;
      continue;
    }
    currency = pricing.currency;
    regularSum += pricing.regularPrice * comp.quantity;
    publicSum += pricing.publicPrice * comp.quantity;
  }

  // Rounded to 2 decimals
  regularSum = Math.round(regularSum * 100) / 100;
  publicSum = Math.round(publicSum * 100) / 100;
  const roundedPrice = Math.round(comboPrice * 100) / 100;

  const isValidBenefit =
    isPricingComplete &&
    roundedPrice > 0 &&
    roundedPrice < regularSum &&
    roundedPrice < publicSum;

  let message: string;
  if (!isPricingComplete) {
    message = "No se puede confirmar la comparación porque faltan precios de uno o más componentes.";
  } else if (roundedPrice <= 0) {
    message = "El precio del combo debe ser mayor a cero.";
  } else if (roundedPrice >= regularSum || roundedPrice >= publicSum) {
    message =
      "El precio del combo debe ser menor que la suma regular y que la suma pública vigente de sus componentes.";
  } else {
    message = "El precio propuesto es menor que ambas referencias actuales.";
  }

  return {
    regularSum,
    publicSum,
    comboPrice: roundedPrice,
    isValidBenefit,
    isPricingComplete,
    currency,
    message,
  };
}

export class MockCombosRepository implements CombosRepository {
  private combos: ComboView[];
  private pricing: Record<string, ComponentPricingSnapshot>;
  private nextId = 100;

  constructor(customCombos?: ComboView[]) {
    // Clone to prevent cross-test pollution
    this.combos = (customCombos ?? initialCombos).map((c) => ({
      ...c,
      components: c.components.map((comp) => ({ ...comp })),
    }));
    this.pricing = { ...initialPricingCatalog };
  }

  // Reset to initial state for tests
  public reset(customCombos?: ComboView[]): void {
    this.combos = (customCombos ?? initialCombos).map((c) => ({
      ...c,
      components: c.components.map((comp) => ({ ...comp })),
    }));
    this.pricing = { ...initialPricingCatalog };
    this.nextId = 100;
  }

  async listCombos(query: ComboListQuery): Promise<ComboPageResult> {
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

  async getCombo(comboId: string): Promise<ComboView | null> {
    const found = this.combos.find((c) => c.comboId === comboId);
    if (!found) return null;
    return {
      ...found,
      components: found.components.map((comp) => ({ ...comp })),
    };
  }

  async createCombo(payload: CreateComboPayload): Promise<ComboView> {
    // Validations per SPEC-002
    if (!payload.nombre || payload.nombre.trim() === "") {
      throw new ComboRepositoryError("ERROR_INTERNO", "El nombre es obligatorio");
    }

    if (!payload.componentes || payload.componentes.length < 2) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTES_INSUFICIENTES",
        "Un combo debe contener al menos dos componentes SKU vendibles directos.",
      );
    }

    const skus = payload.componentes.map((c) => c.sku);
    const uniqueSkus = new Set(skus);
    if (uniqueSkus.size !== skus.length) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTE_DUPLICADO",
        "No se permiten componentes duplicados dentro del mismo combo.",
      );
    }

    // Check nested combo prohibition
    for (const sku of skus) {
      if (sku === "COMBO-ANIDADO-SKU") {
        throw new ComboRepositoryError(
          "COMBO_ANIDADO_NO_PERMITIDO",
          "No se admiten combos anidados como componentes.",
        );
      }
    }

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
          "El precio del combo debe ser menor que la suma regular y que la suma pública vigente de sus componentes.",
      );
    }

    const newId = `combo-${++this.nextId}`;

    const newCombo: ComboView = {
      comboId: newId,
      name: payload.nombre.trim(),
      description: payload.descripcion ? payload.descripcion.trim() : null,
      status: "ACTIVO", // Creation does not allow setting status; default is ACTIVO
      price: payload.precioCombo,
      components: payload.componentes.map((comp) => {
        const pr = this.pricing[comp.sku];
        // Lookup candidate metadata if available
        let productName = comp.sku;
        let variantLabel: string | undefined;
        for (const p of catalogCandidateProducts) {
          if (!p.hasVariants && p.skuBase === comp.sku) {
            productName = p.name;
            break;
          }
          const v = p.variants.find((vr) => vr.sku === comp.sku);
          if (v) {
            productName = p.name;
            variantLabel = v.label;
            break;
          }
        }

        return {
          sku: comp.sku,
          quantity: comp.quantity,
          productName,
          variantLabel,
          regularPrice: pr?.regularPrice ?? 0,
          publicPrice: pr?.publicPrice ?? 0,
          currency: pr?.currency ?? "PEN",
        };
      }),
      informativeAvailability: 10,
      calculatedAt: new Date().toISOString(),
      freshness: "ACTUALIZADA",
      version: 1,
    };

    this.combos.unshift(newCombo);
    return { ...newCombo };
  }

  async updateCombo(
    comboId: string,
    payload: UpdateComboPayload,
  ): Promise<ComboView> {
    const existingIndex = this.combos.findIndex((c) => c.comboId === comboId);
    if (existingIndex === -1) {
      throw new ComboRepositoryError(
        "COMBO_NO_ENCONTRADO",
        `No se encontró el combo con identificador ${comboId}`,
      );
    }

    const current = this.combos[existingIndex];
    if (!current) {
      throw new ComboRepositoryError(
        "COMBO_NO_ENCONTRADO",
        `No se encontró el combo con identificador ${comboId}`,
      );
    }

    // Concurrency check
    if (payload.version !== current.version) {
      throw new ComboRepositoryError(
        "VERSION_CONFLICT",
        "Este combo cambió desde que comenzaste a editarlo. Revisa la versión actual antes de volver a guardar tus cambios.",
        current.version,
      );
    }

    if (!payload.nombre || payload.nombre.trim() === "") {
      throw new ComboRepositoryError("ERROR_INTERNO", "El nombre es obligatorio");
    }

    if (!payload.componentes || payload.componentes.length < 2) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTES_INSUFICIENTES",
        "Un combo debe contener al menos dos componentes SKU vendibles directos.",
      );
    }

    const skus = payload.componentes.map((c) => c.sku);
    const uniqueSkus = new Set(skus);
    if (uniqueSkus.size !== skus.length) {
      throw new ComboRepositoryError(
        "COMBO_COMPONENTE_DUPLICADO",
        "No se permiten componentes duplicados dentro del mismo combo.",
      );
    }

    // Check nested combo prohibition
    for (const sku of skus) {
      if (sku === "COMBO-ANIDADO-SKU") {
        throw new ComboRepositoryError(
          "COMBO_ANIDADO_NO_PERMITIDO",
          "No se admiten combos anidados como componentes.",
        );
      }
    }

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
          "El precio del combo debe ser menor que la suma regular y que la suma pública vigente de sus componentes.",
      );
    }

    const updated: ComboView = {
      ...current,
      name: payload.nombre.trim(),
      description: payload.descripcion ? payload.descripcion.trim() : null,
      price: payload.precioCombo,
      version: current.version + 1,
      components: payload.componentes.map((comp) => {
        const pr = this.pricing[comp.sku];
        let productName = comp.sku;
        let variantLabel: string | undefined;
        for (const p of catalogCandidateProducts) {
          if (!p.hasVariants && p.skuBase === comp.sku) {
            productName = p.name;
            break;
          }
          const v = p.variants.find((vr) => vr.sku === comp.sku);
          if (v) {
            productName = p.name;
            variantLabel = v.label;
            break;
          }
        }

        return {
          sku: comp.sku,
          quantity: comp.quantity,
          productName,
          variantLabel,
          regularPrice: pr?.regularPrice ?? 0,
          publicPrice: pr?.publicPrice ?? 0,
          currency: pr?.currency ?? "PEN",
        };
      }),
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

    const current = this.combos[existingIndex];
    if (!current) {
      throw new ComboRepositoryError(
        "COMBO_NO_ENCONTRADO",
        `No se encontró el combo con identificador ${comboId}`,
      );
    }
    if (current.status === "INACTIVO") {
      // Already deactivated, return current
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

  async getComponentsPricing(skus: string[]): Promise<Record<string, ComponentPricingSnapshot>> {
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
