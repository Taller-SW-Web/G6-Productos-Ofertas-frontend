import { catalogCategories, catalogProducts } from "../mocks/catalogChoices";
import { readMockCatalogCategories, readMockCatalogProducts } from "../../catalog/adapters/mockCatalogConsumers";
import type { PromotionCatalogRepository } from "../services/catalogRepository";
export function createMockPromotionCatalogRepository(): PromotionCatalogRepository {
  return {
    async products(signal) {
      signal.throwIfAborted();
      const current = await readMockCatalogProducts(signal);
      return [...structuredClone(catalogProducts.filter(item => !current.some(row => row.id === item.id))), ...current]
        .filter(item => item.active);
    },
    async categories(signal) {
      signal.throwIfAborted();
      const current = await readMockCatalogCategories(signal);
      return [...structuredClone(catalogCategories.filter(item => !current.some(row => row.id === item.id))), ...current]
        .filter(item => item.active);
    },
  };
}
