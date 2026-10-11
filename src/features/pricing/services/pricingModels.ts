import type { PriceQuery, PriceView } from "./pricingRepository";

// Presentation/interaction models only. These are not HTTP DTOs.
export type ReviewScenario =
  | "default"
  | "loading"
  | "empty"
  | "error"
  | "conflict"
  | "overlap"
  | "unauthorized"
  | "forbidden"
  | "unknown";
export type OfferAction = "CONSERVAR" | "ESTABLECER" | "ELIMINAR";
export interface WriteTarget {
  targetId: string;
  channel: PriceQuery["channel"];
}
export interface EditablePrice {
  view: PriceView;
  regular: string;
  offer: string | null;
  currency: string;
}
export interface PriceDraft {
  regular: string;
  offer: string;
  offerAction: OfferAction;
  currency: string;
  reason: string;
}
export interface PriceChange {
  target: WriteTarget;
  draft: PriceDraft;
  version: number;
}
export interface ScheduleDraft {
  kind: "REGULAR" | "OFERTA";
  amount: string;
  currency: string;
  channel: "global" | "retail";
  start: string;
  end: string;
  reason: string;
}
export interface ScheduleView {
  id: string;
  kind: ScheduleDraft["kind"];
  amount: string;
  currency: string;
  channel: "global" | "retail";
  start: string;
  end: string | null;
  status: "SCHEDULED" | "ACTIVE" | "HISTORICAL" | "CANCELLED";
}
export interface SchedulePage {
  items: ScheduleView[];
  page: number;
  pageSize: number;
  total: number;
}
export type BatchStatus =
  "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED";
export interface ImportRow {
  id: string;
  sku: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  code: string | null;
  detail: string | null;
}
export interface PrevalidationView {
  valid: boolean;
  total: number;
  errors: ImportRow[];
}
export interface BatchView {
  id: string;
  status: BatchStatus;
  allowPartial: boolean;
  total: number;
  completed: number;
  failed: number;
  rows?: ImportRow[];
}
export type BatchScenario =
  | "default"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "no-rows"
  | "error"
  | "loading"
  | "forbidden";
export class PricingFailure extends Error {
  constructor(
    public kind:
      | "conflict"
      | "overlap"
      | "unauthorized"
      | "forbidden"
      | "unknown"
      | "error",
    message: string,
  ) {
    super(message);
  }
}
