// Presentation models for administrative reading; these are not HTTP DTOs.
export type CouponStatus = "active" | "inactive";
export type CouponScenario =
  | "default"
  | "loading"
  | "empty"
  | "error"
  | "session"
  | "forbidden"
  | "missing"
  | "usage-unavailable";

export interface CouponView {
  id: string;
  promotionId: string;
  code: string;
  status: CouponStatus;
  promotion: {
    name: string;
    validFrom: string | undefined;
    validUntil: string | undefined;
  } | null;
  globalLimit: number | null | undefined;
  customerLimit: number | null | undefined;
  consumedUses: number | undefined;
  remainingUses: number | null | undefined;
  minimumAmount: string | null | undefined;
  cancellationPolicy: "restore" | "keep";
}

export interface CouponQuery {
  status: CouponStatus | "all";
  page: number;
  pageSize: number;
}
export interface CouponListResult {
  items: CouponView[];
  total: number;
  page: number;
}
export type CouponReadFailure = "unavailable" | "session" | "forbidden";
export class CouponReadError extends Error {
  constructor(
    public readonly kind: CouponReadFailure,
    message: string,
  ) {
    super(message);
    this.name = "CouponReadError";
  }
}
export interface CouponRepository {
  promotions(signal: AbortSignal): Promise<CouponPromotion[]>;
  create(
    values: CouponInput,
    scenario: CouponMutationScenario,
    signal: AbortSignal,
  ): Promise<CouponView>;
  update(
    id: string,
    values: Omit<CouponInput, "status">,
    scenario: CouponMutationScenario,
    signal: AbortSignal,
  ): Promise<CouponView>;
  changeStatus(
    id: string,
    status: CouponStatus,
    scenario: CouponMutationScenario,
    signal: AbortSignal,
  ): Promise<CouponView>;
  list(
    query: CouponQuery,
    scenario: CouponScenario,
    signal: AbortSignal,
  ): Promise<CouponListResult>;
  read(
    id: string,
    scenario: CouponScenario,
    signal: AbortSignal,
  ): Promise<CouponView | null>;
}

export interface CouponPromotion {
  id: string;
  name: string;
  mode: "coupon" | "automatic";
  validFrom: string | undefined;
  validUntil: string | undefined;
}
export interface CouponInput {
  code: string;
  promotionId: string;
  status: CouponStatus;
  globalLimit: number | null;
  customerLimit: number | null;
  minimumAmount: string | null;
  cancellationPolicy: "restore" | "keep";
}
export type CouponMutationScenario =
  | "default"
  | "saving"
  | "save-error"
  | "rejected"
  | "conflict"
  | "unknown-result"
  | "session"
  | "forbidden";
export type CouponField = keyof CouponInput;
export type CouponFieldErrors = Partial<Record<CouponField, string>>;
export class CouponWriteError extends Error {
  constructor(
    public readonly kind:
      | "validation"
      | "rejected"
      | "unknown"
      | "conflict"
      | "access",
    message: string,
    public readonly fields: CouponFieldErrors = {},
  ) {
    super(message);
    this.name = "CouponWriteError";
  }
}
