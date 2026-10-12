import { mockPromotionCatalogRepository } from "../adapters/mockPromotionCatalogRepository";
import type { PromotionCatalogRepository } from "./catalogRepository";
export const promotionCatalogService: PromotionCatalogRepository =
  mockPromotionCatalogRepository;
