import { catalogCategories, catalogProducts } from "../mocks/catalogChoices";
import { checkAdministrationRead } from "../services/administration";
import type { PromotionCatalogRepository } from "../services/catalogRepository";
export const mockPromotionCatalogRepository: PromotionCatalogRepository = {
  async products(scenario, signal) {
    await checkAdministrationRead(scenario, signal);
    signal.throwIfAborted();
    return scenario === "selection-empty"
      ? []
      : structuredClone(catalogProducts.filter((item) => item.active));
  },
  async categories(scenario, signal) {
    await checkAdministrationRead(scenario, signal);
    signal.throwIfAborted();
    return scenario === "selection-empty"
      ? []
      : structuredClone(catalogCategories.filter((item) => item.active));
  },
};
