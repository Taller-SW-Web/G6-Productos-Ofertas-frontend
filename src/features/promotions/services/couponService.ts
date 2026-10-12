import { promotionServices } from "./promotionServices";
import type { CouponRepository } from "./couponRepository";
export const couponService: CouponRepository = promotionServices.coupons;
