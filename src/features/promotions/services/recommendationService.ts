import { promotionServices } from "./promotionServices";
import type { RecommendationRepository } from "./recommendationRepository";
export const recommendationService: RecommendationRepository =
  promotionServices.recommendations;
