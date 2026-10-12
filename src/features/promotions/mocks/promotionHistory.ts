import type { CouponView } from "../services/couponRepository";

// Simulated provider history, not a DTO or a capability computed by React.
export interface PromotionHistoryFacts {
  activated: boolean | undefined;
  used: boolean | undefined;
}
export function createPromotionHistory(
  initial: Readonly<Record<string, PromotionHistoryFacts>>,
) {
  const facts = new Map(
    Object.entries(initial).map(([id, value]) => [id, { ...value }]),
  );
  const observedCoupons = new Map<
    string,
    { promotionId: string; consumedUses: number | undefined }
  >();
  return {
    initialize(id: string, active: boolean) {
      facts.set(id, { activated: active, used: false });
    },
    activate(id: string) {
      const value = facts.get(id);
      facts.set(id, { activated: true, used: value?.used });
    },
    observe(coupon: CouponView) {
      const value = facts.get(coupon.promotionId);
      const previous = observedCoupons.get(coupon.id);
      observedCoupons.set(coupon.id, {
        promotionId: coupon.promotionId,
        consumedUses: coupon.consumedUses,
      });
      if (!value) return;
      if (coupon.consumedUses === undefined) {
        if (value.used !== true) value.used = undefined;
      } else if (!previous) {
        if (coupon.consumedUses > 0) value.used = true;
      } else if (
        previous.consumedUses === undefined ||
        coupon.consumedUses < previous.consumedUses
      ) {
        if (value.used !== true) value.used = undefined;
      } else if (coupon.consumedUses > previous.consumedUses) {
        if (previous.promotionId === coupon.promotionId) value.used = true;
        else {
          // An external change in both association and count cannot locate the new uses.
          const priorHistory = facts.get(previous.promotionId);
          if (priorHistory && priorHistory.used !== true)
            priorHistory.used = undefined;
          if (value.used !== true) value.used = undefined;
        }
      }
      // A reassignment preserves the coupon's total uses; it is not a new use of the destination.
    },
    capability(
      id: string,
      active: boolean,
      hasCoupons: boolean,
    ): boolean | undefined {
      const value = facts.get(id);
      if (
        active ||
        hasCoupons ||
        value?.activated === true ||
        value?.used === true
      )
        return false;
      if (value?.activated === undefined || value.used === undefined)
        return undefined;
      return true;
    },
  };
}
export type PromotionHistory = ReturnType<typeof createPromotionHistory>;

export const promotionHistoryFixtures: Readonly<
  Record<string, PromotionHistoryFacts>
> = {
  carrera: { activated: true, used: false },
  bienvenida: { activated: false, used: true },
  running: { activated: true, used: false },
  cyber: { activated: true, used: true },
  flash: { activated: false, used: true },
  "nueva-inactiva": { activated: false, used: false },
  historica: { activated: true, used: false },
  "capacidad-desconocida": { activated: undefined, used: undefined },
};
