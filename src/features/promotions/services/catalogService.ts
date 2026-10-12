import { promotionServices } from "./promotionServices";
import type { PromotionCatalogRepository } from "./catalogRepository";
export const promotionCatalogService: PromotionCatalogRepository =
  promotionServices.catalog;
