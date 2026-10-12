import { mockCouponRepository } from "../adapters/mockCouponRepository";
import type { CouponRepository } from "./couponRepository";

// Same selection convention as pricingService: a single feature composition point.
// No HTTP adapter or integration is claimed.
export const couponService: CouponRepository = mockCouponRepository;
