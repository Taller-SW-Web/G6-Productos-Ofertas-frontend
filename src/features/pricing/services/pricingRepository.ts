import type {
  BatchScenario,
  BatchView,
  EditablePrice,
  PrevalidationView,
  PriceChange,
  ReviewScenario,
  ScheduleDraft,
  SchedulePage,
  ScheduleView,
  WriteTarget,
} from "./pricingModels";
// Typed UI models; these are not provider DTOs or a new HTTP contract.
export type PriceScenario = "default" | "loading" | "empty" | "error";
export interface PriceTarget {
  id: string;
  label: string;
  productId: string;
  sku?: string;
  kind: "product" | "variant";
  referenceSku?: string;
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
  readEditable(
    target: WriteTarget,
    scenario: ReviewScenario,
    signal: AbortSignal,
  ): Promise<EditablePrice | null>;
  update(
    change: PriceChange,
    scenario: ReviewScenario,
    signal: AbortSignal,
  ): Promise<EditablePrice>;
  listSchedules(
    targetId: string,
    page: number,
    scenario: ReviewScenario,
    signal: AbortSignal,
  ): Promise<SchedulePage>;
  schedule(
    targetId: string,
    draft: ScheduleDraft,
    scenario: ReviewScenario,
    signal: AbortSignal,
  ): Promise<ScheduleView>;
  readHistorical(
    query: PriceQuery,
    at: string,
    scenario: ReviewScenario,
    signal: AbortSignal,
  ): Promise<{ price: PriceView; validityId: string } | null>;
  previewFixture(
    scenario: "valid" | "rows" | "unreadable" | "error",
    signal: AbortSignal,
  ): Promise<PrevalidationView>;
  readBatch(
    id: string,
    scenario: BatchScenario,
    signal: AbortSignal,
  ): Promise<BatchView | null>;
  report(
    id: string,
    scenario: BatchScenario,
    signal: AbortSignal,
  ): Promise<string>;
  read(
    query: PriceQuery,
    scenario: PriceScenario,
    signal: AbortSignal,
  ): Promise<PriceSnapshot | null>;
}
