import { mockRecommendationRepository } from "../adapters/mockRecommendationRepository";
import type { RecommendationRepository } from "./recommendationRepository";
export const recommendationService: RecommendationRepository =
  mockRecommendationRepository;
