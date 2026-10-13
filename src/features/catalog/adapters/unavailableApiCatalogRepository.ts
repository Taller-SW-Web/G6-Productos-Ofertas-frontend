import { CatalogError, type CatalogRepository } from "../services/catalogRepository";

// Deliberately fail closed. No endpoint, credentials or fallback are invented.
export function createUnavailableApiCatalogRepository(): CatalogRepository {
  async function unavailable(): Promise<never> {
    throw new CatalogError(
      "server",
      "El adapter API de Catálogo no está configurado. No se utilizarán datos simulados como sustitución.",
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
