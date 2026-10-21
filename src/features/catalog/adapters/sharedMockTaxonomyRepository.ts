import { getTaxonomyServices } from "../../taxonomy/services/taxonomyServices";
import type { TaxonomyRepository } from "../services/taxonomyRepository";
import { MockTaxonomyRepository } from "./mockTaxonomyRepository";
import { createTaxonomyServicesAdapter } from "./taxonomyServicesAdapter";

// Explicit compatibility for the pre-existing demo IDs. Never equate two IDs by
// name, migrate products, or fill missing official schema roles from these records.
// Taxonomy owns all editable/new masters; historical records remain immutable.
export function createSharedMockTaxonomyRepository(): TaxonomyRepository {
  const historical = new MockTaxonomyRepository();
  const official = createTaxonomyServicesAdapter(getTaxonomyServices("mock"));
  const merge = <T extends { id: string }>(old: T[], current: T[]): T[] => [
    ...old.filter(item => !current.some(row => row.id === item.id)), ...current,
  ];
  return {
    getCategories: async signal => merge(await historical.getCategories(), await official.getCategories(signal)),
    getBrands: async signal => merge(await historical.getBrands(), await official.getBrands(signal)),
    getProductTypes: async signal => merge(await historical.getProductTypes(), await official.getProductTypes(signal)),
    async getAttributeSchema(typeId, signal) {
      const currentTypes = await official.getProductTypes(signal);
      if (currentTypes.some(type => type.id === typeId)) return official.getAttributeSchema(typeId, signal);
      const historicalTypes = await historical.getProductTypes();
      return historicalTypes.some(type => type.id === typeId)
        ? historical.getAttributeSchema(typeId)
        : official.getAttributeSchema(typeId, signal);
    },
  };
}

export const sharedMockTaxonomyRepository = createSharedMockTaxonomyRepository();
