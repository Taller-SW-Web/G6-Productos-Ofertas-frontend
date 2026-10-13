import type { TaxonomyRepository } from "../services/taxonomyRepository";

// Deliberately fail closed. No endpoint, credentials or fallback are invented.
export function createUnavailableApiTaxonomyRepository(): TaxonomyRepository {
  async function unavailable(): Promise<never> {
    throw new Error(
      "El adapter API de Taxonomía no está configurado. No se utilizarán datos simulados como sustitución.",
    );
  }

  return {
    getCategories: unavailable,
    getBrands: unavailable,
    getProductTypes: unavailable,
    getAttributeSchema: unavailable,
  };
}
