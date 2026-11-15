import type { TaxonomyGatewayTransport } from "../adapters/httpProductTypeAdapter";
import { createHttpProductTypeAdminAdapter } from "../adapters/httpProductTypeAdminAdapter";
import { createHttpBrandRepository, createHttpCategoryRepository, createHttpCharacteristicRepository, createHttpSeoRepository } from "../adapters/httpTaxonomyAdmin";
import { getTaxonomyGateway } from "./taxonomyGatewayRuntime";
import type { DataMode } from "../../../app/config/dataMode";
import { resolveDataMode } from "../../../app/config/dataMode";
import { mockBrandAdapter } from "../adapters/mockBrandAdapter";
import { mockCategoryAdapter } from "../adapters/mockCategoryAdapter";
import { mockCharacteristicAdapter } from "../adapters/mockCharacteristicAdapter";
import { mockProductTypeAdapter } from "../adapters/mockProductTypeAdapter";
import { mockSeoAdapter } from "../adapters/mockSeoAdapter";
import type { BrandRepository } from "./brandRepository";
import type { CategoryRepository } from "./categoryRepository";
import type { CharacteristicRepository } from "./characteristicRepository";
import type { ProductTypeRepository } from "./productTypeRepository";
import type { SeoRepository } from "./seoRepository";

export const TAXONOMY_API_UNAVAILABLE_MESSAGE = "La sesión G7 o el Gateway autenticado de Taxonomía no están disponibles.";
export interface TaxonomyServices { category: CategoryRepository; brand: BrandRepository; productType: ProductTypeRepository; seo: SeoRepository; characteristic: CharacteristicRepository; }
const lazyGateway: TaxonomyGatewayTransport = {
  scopeId() { return getTaxonomyGateway()?.scopeId?.() ?? null; },
  request(path, signal, correlationId) {
    const gateway = getTaxonomyGateway(); if (!gateway) return Promise.reject(new Error(TAXONOMY_API_UNAVAILABLE_MESSAGE));
    return gateway.request(path, signal, correlationId);
  },
  requestWithInit(path, init) {
    const gateway = getTaxonomyGateway(); if (!gateway?.requestWithInit) return Promise.reject(new Error(TAXONOMY_API_UNAVAILABLE_MESSAGE));
    return gateway.requestWithInit(path, init);
  },
};
const httpServices: TaxonomyServices = {
  category: createHttpCategoryRepository(lazyGateway), brand: createHttpBrandRepository(lazyGateway),
  productType: createHttpProductTypeAdminAdapter(lazyGateway), seo: createHttpSeoRepository(lazyGateway),
  characteristic: createHttpCharacteristicRepository(lazyGateway),
};
export function createTaxonomyServices(mode: DataMode): TaxonomyServices {
  if (mode === "api") return httpServices;
  return { category: mockCategoryAdapter, brand: mockBrandAdapter, productType: mockProductTypeAdapter, seo: mockSeoAdapter, characteristic: mockCharacteristicAdapter };
}
const cache = new Map<DataMode, TaxonomyServices>();
export function getTaxonomyServices(mode: DataMode): TaxonomyServices { const cached = cache.get(mode); if (cached) return cached; const services = createTaxonomyServices(mode); cache.set(mode, services); return services; }
export function resolveTaxonomyServices(): TaxonomyServices { const env = import.meta.env; const mode = resolveDataMode(env?.VITE_DATA_MODE, env?.DEV ?? true); return getTaxonomyServices(mode); }
