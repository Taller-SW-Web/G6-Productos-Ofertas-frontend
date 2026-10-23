import { CatalogError, type CatalogRepository } from "../services/catalogRepository";

// Deliberately fail closed. No endpoint, credentials or fallback are invented.
export function createUnavailableApiCatalogRepository(): CatalogRepository {
  async function unavailable(): Promise<never> {
    throw new CatalogError(
      "server",
      "La consulta del catálogo no está disponible.",
    );
  }

  return {
    list: unavailable,
    getById: unavailable,
    create: unavailable,
    update: unavailable,
    activate: unavailable,
    deactivate: unavailable,
    reactivate: unavailable,
    getPreparation: unavailable,
    retryPreparation: unavailable,
    listVariants: unavailable,
    getVariantById: unavailable,
    createVariant: unavailable,
    updateVariant: unavailable,
    activateVariant: unavailable,
    deactivateVariant: unavailable,
    reactivateVariant: unavailable,
    retryVariantPreparation: unavailable,
  };
}
