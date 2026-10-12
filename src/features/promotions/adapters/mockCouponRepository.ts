import { couponFixtures } from "../mocks/coupons";
import {
  couponPromotionChoices,
  markCampaignCouponLinked,
} from "./mockCampaignRepository";
import {
  CouponReadError,
  CouponWriteError,
  type CouponInput,
  type CouponMutationScenario,
  type CouponView,
  type CouponRepository,
  type CouponScenario,
} from "../services/couponRepository";
import { normalizeCouponCode } from "../services/couponValidation";

const records: CouponView[] = couponFixtures.map((coupon) =>
  structuredClone(coupon),
);
let sequence = 0;

async function checkWrite(
  scenario: CouponMutationScenario,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (scenario === "saving")
    await new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  if (scenario === "session" || scenario === "forbidden")
    throw new CouponWriteError(
      "access",
      "No tienes acceso para modificar cupones. Se conserva la información anterior.",
    );
  if (scenario === "save-error" || scenario === "rejected")
    throw new CouponWriteError(
      "rejected",
      "No se pudo guardar el cambio. Tus entradas y la información anterior se conservan.",
    );
  if (scenario === "conflict")
    throw new CouponWriteError(
      "conflict",
      "La información cambió antes del guardado. Consulta el registro y revisa tu propuesta antes de continuar.",
    );
}
function checkInput(values: Omit<CouponInput, "status">, excludeId?: string) {
  const code = normalizeCouponCode(values.code);
  if (!/^[A-Z0-9_-]+$/.test(code))
    throw new CouponWriteError("validation", "Revisa el código.", {
      code: "El código contiene caracteres no permitidos.",
    });
  if (records.some((coupon) => coupon.id !== excludeId && coupon.code === code))
    throw new CouponWriteError("validation", "El código ya está registrado.", {
      code: "Ya existe otro cupón con este código.",
    });
  const promotion = couponPromotionChoices().find(
    (item) => item.id === values.promotionId && item.mode === "coupon",
  );
  if (!promotion)
    throw new CouponWriteError(
      "validation",
      "La promoción no está disponible.",
      {
        promotionId: "Selecciona una promoción de modalidad cupón disponible.",
      },
    );
  for (const field of ["globalLimit", "customerLimit"] as const)
    if (
      values[field] !== null &&
      (!Number.isSafeInteger(values[field]) || values[field] < 1)
    )
      throw new CouponWriteError("validation", "Revisa los límites.", {
        [field]: "El límite debe ser un entero positivo.",
      });
  return {
    code,
    promotion: {
      name: promotion.name,
      validFrom: promotion.validFrom,
      validUntil: promotion.validUntil,
    },
  };
}
function responseAfterWrite<T>(result: T, scenario: CouponMutationScenario) {
  if (scenario === "unknown-result")
    throw new CouponWriteError(
      "unknown",
      "No se pudo confirmar el resultado. Conservamos tu propuesta; consulta el resultado antes de enviar nuevamente.",
    );
  return structuredClone(result);
}

async function checkScenario(scenario: CouponScenario, signal: AbortSignal) {
  signal.throwIfAborted();
  if (scenario === "loading") {
    await new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  }
  if (scenario === "session")
    throw new CouponReadError(
      "session",
      "Tu sesión no permite consultar cupones. Verifica el acceso antes de continuar.",
    );
  if (scenario === "forbidden")
    throw new CouponReadError(
      "forbidden",
      "No tienes permiso para consultar cupones. Solicita acceso al responsable de tu cuenta.",
    );
  if (scenario === "error")
    throw new CouponReadError(
      "unavailable",
      "No se pudo consultar la información. El contexto se conserva; puedes volver a consultar.",
    );
}

export const mockCouponRepository: CouponRepository = {
  async promotions(signal) {
    signal.throwIfAborted();
    return structuredClone(couponPromotionChoices());
  },
  async create(values, scenario, signal) {
    await checkWrite(scenario, signal);
    signal.throwIfAborted();
    const mapped = checkInput(values);
    const coupon = {
      ...values,
      ...mapped,
      id: `cupon-demo-${++sequence}`,
      consumedUses: 0,
      remainingUses: values.globalLimit === null ? null : undefined,
    };
    records.push(coupon);
    markCampaignCouponLinked(values.promotionId);
    return responseAfterWrite(coupon, scenario);
  },
  async update(id, values, scenario, signal) {
    await checkWrite(scenario, signal);
    signal.throwIfAborted();
    const index = records.findIndex((coupon) => coupon.id === id);
    const previous = records[index];
    if (!previous)
      throw new CouponWriteError(
        "rejected",
        "El cupón ya no está disponible. No se guardó el cambio.",
      );
    const mapped = checkInput(values, id);
    const coupon = {
      ...previous,
      ...values,
      ...mapped,
      remainingUses:
        values.globalLimit === previous.globalLimit
          ? previous.remainingUses
          : values.globalLimit === null
            ? null
            : undefined,
    };
    records[index] = coupon;
    markCampaignCouponLinked(values.promotionId);
    return responseAfterWrite(coupon, scenario);
  },
  async changeStatus(id, status, scenario, signal) {
    await checkWrite(scenario, signal);
    signal.throwIfAborted();
    const index = records.findIndex((coupon) => coupon.id === id);
    const previous = records[index];
    if (!previous)
      throw new CouponWriteError(
        "rejected",
        "El cupón ya no está disponible. No se cambió el estado.",
      );
    const coupon = { ...previous, status };
    records[index] = coupon;
    return responseAfterWrite(coupon, scenario);
  },
  async list(query, scenario, signal) {
    await checkScenario(scenario, signal);
    signal.throwIfAborted();
    const rows =
      scenario === "empty"
        ? []
        : records.filter(
            (coupon) =>
              query.status === "all" || coupon.status === query.status,
          );
    const page = Math.min(
      query.page,
      Math.max(1, Math.ceil(rows.length / query.pageSize)),
    );
    const start = (page - 1) * query.pageSize;
    return {
      items: rows
        .slice(start, start + query.pageSize)
        .map((coupon) => structuredClone(coupon)),
      total: rows.length,
      page,
    };
  },
  async read(id, scenario, signal) {
    await checkScenario(scenario, signal);
    signal.throwIfAborted();
    const coupon =
      scenario === "missing"
        ? undefined
        : records.find((item) => item.id === id);
    if (!coupon) return null;
    const snapshot = structuredClone(coupon);
    if (scenario === "usage-unavailable") {
      snapshot.consumedUses = undefined;
      snapshot.remainingUses = undefined;
    }
    return snapshot;
  },
};
