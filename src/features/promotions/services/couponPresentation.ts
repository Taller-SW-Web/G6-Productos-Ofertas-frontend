import type {
  CouponScenario,
  CouponStatus,
  CouponView,
  CouponMutationScenario,
} from "./couponRepository";

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

export function readCouponMutationScenario(
  params: URLSearchParams,
): CouponMutationScenario {
  if (!import.meta.env.DEV || params.get("modoRevision") !== "1")
    return "default";
  switch (params.get("escenario")) {
    case "saving":
      return "saving";
    case "save-error":
      return "save-error";
    case "rejected":
      return "rejected";
    case "unknown-result":
      return "unknown-result";
    case "conflict":
      return "conflict";
    case "session":
      return "session";
    case "forbidden":
      return "forbidden";
    default:
      return "default";
  }
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
export function readCouponScenario(params: URLSearchParams): CouponScenario {
  if (!import.meta.env.DEV || params.get("modoRevision") !== "1")
    return "default";
  const value = params.get("escenario");
  switch (value) {
    case "loading":
    case "empty":
    case "error":
    case "session":
    case "forbidden":
    case "missing":
    case "usage-unavailable":
      return value;
    default:
      return "default";
  }
}
