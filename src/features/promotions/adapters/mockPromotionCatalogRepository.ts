import { catalogCategories, catalogProducts } from "../mocks/catalogChoices";
import type { PromotionCatalogRepository } from "../services/catalogRepository";
export function createMockPromotionCatalogRepository(): PromotionCatalogRepository {
  return {
    async products(signal) {
      signal.throwIfAborted();
      return structuredClone(catalogProducts.filter((item) => item.active));
    },
    async categories(signal) {
      signal.throwIfAborted();
      return structuredClone(catalogCategories.filter((item) => item.active));
    },
  };
}
