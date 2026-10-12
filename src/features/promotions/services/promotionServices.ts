import type {
  CouponRepository,
  CouponView,
  CouponPromotion,
} from "./couponRepository";
import type { CampaignRepository } from "./campaignRepository";
import type { RecommendationRepository } from "./recommendationRepository";
import type { PromotionCatalogRepository } from "./catalogRepository";
import { createMockCouponRepository } from "../adapters/mockCouponRepository";
import { createMockCampaignRepository } from "../adapters/mockCampaignRepository";
import { createMockRecommendationRepository } from "../adapters/mockRecommendationRepository";
import { createMockPromotionCatalogRepository } from "../adapters/mockPromotionCatalogRepository";
import {
  createPromotionHistory,
  promotionHistoryFixtures,
} from "../mocks/promotionHistory";

export interface PromotionServices {
  coupons: CouponRepository;
  campaigns: CampaignRepository;
  recommendations: RecommendationRepository;
  catalog: PromotionCatalogRepository;
}

// Composition point: a supplied HTTP adapter implements the same presentation port.
// No endpoint, token, HTTP DTO or demonstration parameter belongs to this interface.
export function createPromotionServices(
  adapters: PromotionServices,
): PromotionServices {
  return adapters;
}

export function createMockPromotionServices(
  overrides: Partial<PromotionServices> = {},
): PromotionServices {
  const history = createPromotionHistory(promotionHistoryFixtures);
  const observe = (record: CouponView | null) => {
    if (record) history.observe(record);
    return record;
  };
  async function observeAll(signal: AbortSignal) {
    const rows: CouponView[] = [];
    for (let page = 1; ; page++) {
      const result = await coupons.list(
        { status: "all", page, pageSize: 100 },
        signal,
      );
      rows.push(...result.items);
      if (rows.length >= result.total || !result.items.length) break;
    }
    return rows;
  }
  async function promotions(signal: AbortSignal): Promise<CouponPromotion[]> {
    const rows: CouponPromotion[] = [];
    for (let page = 1; ; page++) {
      const result = await campaigns.list(
        { status: "all", kind: "coupon", page, pageSize: 100 },
        signal,
      );
      rows.push(
        ...result.items
          .filter((row) => row.configuration.mode === "coupon")
          .map((row) => ({
            id: row.id,
            name: row.name,
            mode: "coupon" as const,
            validFrom: `${row.configuration.validFrom}:00-05:00`,
            validUntil: `${row.configuration.validUntil}:00-05:00`,
          })),
      );
      if (page * 100 >= result.total || !result.items.length) break;
    }
    return rows;
  }
  const catalog = overrides.catalog ?? createMockPromotionCatalogRepository();
  const campaigns =
    overrides.campaigns ??
    createMockCampaignRepository({
      catalog: () => catalog,
      history,
      hasCoupons: async (id, signal) =>
        (await observeAll(signal)).some((coupon) => coupon.promotionId === id),
    });
  const couponAdapter =
    overrides.coupons ?? createMockCouponRepository({ promotions });
  const coupons: CouponRepository = {
    promotions: (signal) => couponAdapter.promotions(signal),
    async list(query, signal) {
      const result = await couponAdapter.list(query, signal);
      result.items.forEach(observe);
      return result;
    },
    async read(id, signal) {
      return observe(await couponAdapter.read(id, signal));
    },
    async create(input, signal) {
      const result = await couponAdapter.create(input, signal);
      observe(result);
      return result;
    },
    async update(id, input, signal) {
      const previous = await couponAdapter.read(id, signal);
      const result = await couponAdapter.update(id, input, signal);
      observe(previous);
      observe(result);
      return result;
    },
    async changeStatus(id, status, signal) {
      const result = await couponAdapter.changeStatus(id, status, signal);
      observe(result);
      return result;
    },
  };
  const recommendations =
    overrides.recommendations ??
    createMockRecommendationRepository(() => catalog);
  return createPromotionServices({
    coupons,
    campaigns,
    recommendations,
    catalog,
  });
}

export const promotionServices = createMockPromotionServices();
