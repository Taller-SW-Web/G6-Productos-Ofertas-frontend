import type { TaxonomyRepository } from "./taxonomyRepository";
import { getCatalogServices } from "./catalogServices";

// Facade for Taxonomy operations decoupled from static mock imports.
// In React components and hooks, prefer `useCatalogServices()`.
export const taxonomyService: TaxonomyRepository = {
  getCategories: (sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).taxonomy.getCategories(sig),
  getBrands: (sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).taxonomy.getBrands(sig),
  getProductTypes: (sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).taxonomy.getProductTypes(sig),
  getAttributeSchema: (typeId, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).taxonomy.getAttributeSchema(typeId, sig),
};
