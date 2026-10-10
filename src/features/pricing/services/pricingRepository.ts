// Typed UI models; these are not provider DTOs or a new HTTP contract.
export type PriceScenario = "default" | "loading" | "empty" | "error";
export interface PriceTarget {
  id: string;
  label: string;
  productId: string;
  sku?: string;
  kind: "product" | "variant";
}
export interface PriceView {
  id: string;
  name: string;
  sku?: string;
  regular: string;
  offer: string | null;
  currency: string;
  version: number;
  origin: "product" | "sku";
  channel: "global" | "retail";
  validFrom: string;
  validUntil: string | null;
  inherited: boolean;
}
export interface PriceQuery {
  targetId: string;
  channel: "global" | "retail";
}
export interface PriceSnapshot {
  price: PriceView;
  breakdown: PriceView[];
}
export interface PricingRepository {
  read(
    query: PriceQuery,
    scenario: PriceScenario,
    signal: AbortSignal,
  ): Promise<PriceSnapshot | null>;
}
