import type {
  CouponFieldErrors,
  CouponInput,
  CouponView,
} from "./couponRepository";

export interface CouponDraft {
  code: string;
  promotionId: string;
  status: CouponInput["status"] | "";
  globalLimit: string;
  customerLimit: string;
  minimumAmount: string;
  cancellationPolicy: CouponInput["cancellationPolicy"] | "";
}
export const emptyCouponDraft: CouponDraft = {
  code: "",
  promotionId: "",
  status: "",
  globalLimit: "",
  customerLimit: "",
  minimumAmount: "",
  cancellationPolicy: "",
};
export function normalizeCouponCode(code: string) {
  return code.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}
export function couponDraftFromRecord(coupon: CouponView): CouponDraft {
  return {
    code: coupon.code,
    promotionId: coupon.promotionId,
    status: coupon.status,
    globalLimit: coupon.globalLimit?.toString() ?? "",
    customerLimit: coupon.customerLimit?.toString() ?? "",
    minimumAmount: coupon.minimumAmount ?? "",
    cancellationPolicy: coupon.cancellationPolicy,
  };
}
export function validateCouponDraft(draft: CouponDraft): {
  errors: CouponFieldErrors;
  values: CouponInput | null;
} {
  const errors: CouponFieldErrors = {};
  const code = normalizeCouponCode(draft.code);
  if (!/^[A-Z0-9_-]+$/.test(code))
    errors.code =
      "Ingresa un código con letras A–Z, números, guion o guion bajo.";
  if (!draft.promotionId)
    errors.promotionId = "Selecciona una promoción de modalidad cupón.";
  if (!draft.status) errors.status = "Selecciona el estado inicial.";
  if (!draft.cancellationPolicy)
    errors.cancellationPolicy = "Selecciona una política de restitución.";
  const limit = (field: "globalLimit" | "customerLimit") => {
    const text = draft[field].trim();
    if (!text) return null;
    const number = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1) {
      errors[field] =
        "Ingresa un entero positivo o deja el campo vacío para indicar Sin límite.";
      return null;
    }
    return number;
  };
  const globalLimit = limit("globalLimit"),
    customerLimit = limit("customerLimit");
  const minimumAmount = draft.minimumAmount.trim().replace(",", ".") || null;
  if (
    minimumAmount &&
    (!/^\d+(\.\d+)?$/.test(minimumAmount) || !/[1-9]/.test(minimumAmount))
  )
    errors.minimumAmount =
      "Ingresa un monto mayor que cero o deja el campo vacío.";
  if (Object.keys(errors).length || !draft.status || !draft.cancellationPolicy)
    return { errors, values: null };
  return {
    errors,
    values: {
      code,
      promotionId: draft.promotionId,
      status: draft.status,
      globalLimit,
      customerLimit,
      minimumAmount,
      cancellationPolicy: draft.cancellationPolicy,
    },
  };
}
export function couponMatchesInput(coupon: CouponView, input: CouponInput) {
  return (
    coupon.code === input.code &&
    coupon.promotionId === input.promotionId &&
    coupon.status === input.status &&
    coupon.globalLimit === input.globalLimit &&
    coupon.customerLimit === input.customerLimit &&
    coupon.minimumAmount === input.minimumAmount &&
    coupon.cancellationPolicy === input.cancellationPolicy
  );
}
