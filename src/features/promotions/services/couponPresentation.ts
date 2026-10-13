import type { CouponStatus, CouponView } from "./couponRepository";

export const couponStatusLabel = (status: CouponStatus) =>
  status === "active" ? "Activo" : "Inactivo";
export const couponLimitLabel = (limit: number | null | undefined) =>
  limit === undefined
    ? "No disponible"
    : limit === null
      ? "Sin límite"
      : String(limit);
export const couponUsageLabel = (uses: number | undefined) =>
  uses === undefined ? "No disponible" : String(uses);
export function couponRemainingLabel(coupon: CouponView) {
  if (coupon.remainingUses === undefined) return "No disponible";
  if (coupon.remainingUses === null)
    return coupon.globalLimit === null ? "Sin límite" : "No disponible";
  return String(coupon.remainingUses);
}

export const couponPolicyLabel = (coupon: CouponView) =>
  coupon.cancellationPolicy === "restore"
    ? "Restaurar uso al cancelar"
    : "No restaurar uso al cancelar";

export function couponDateLabel(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeZone: "America/Lima",
  }).format(new Date(value));
}
export function readPositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, maximum)
    : fallback;
}
