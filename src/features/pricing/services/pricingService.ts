import { mockPricingRepository } from "../adapters/mockPricingRepository";
import type { PricingRepository } from "./pricingRepository";
// Single adapter selection point for Pricing. HTTP integration requires a separate verified contract task.
export const pricingService: PricingRepository = mockPricingRepository;
