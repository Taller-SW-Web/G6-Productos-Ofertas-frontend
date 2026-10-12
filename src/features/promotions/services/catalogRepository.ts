import type { AdministrationScenario } from "./administration";
export interface CatalogProductChoice {
  id: string;
  name: string;
  active: boolean;
  categoryId: string;
  skus: { sku: string; label: string; active: boolean }[];
}
export interface CatalogCategoryChoice {
  id: string;
  name: string;
  active: boolean;
}
export interface PromotionCatalogRepository {
  products(
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<CatalogProductChoice[]>;
  categories(
    scenario: AdministrationScenario,
    signal: AbortSignal,
  ): Promise<CatalogCategoryChoice[]>;
}
