import { campaignFixtures } from "../mocks/campaigns";
import { catalogProducts } from "../mocks/catalogChoices";
import {
  AdministrationError,
  administrationResponse,
  checkAdministrationRead,
  checkAdministrationWrite,
  pageOf,
} from "../services/administration";
import { campaignErrors } from "../services/campaignValidation";
import type {
  CampaignRepository,
  CampaignView,
} from "../services/campaignRepository";
const records: CampaignView[] = campaignFixtures.map((item) =>
  structuredClone(item),
);
const previouslyActivated = new Set(
  records
    .filter(
      (item) =>
        item.status === "active" ||
        (item.canChangeMode === false &&
          item.configuration.mode === "automatic"),
    )
    .map((item) => item.id),
);
const linkedCoupons = new Set(["bienvenida", "running", "cyber", "flash"]);
let sequence = 0;
function capability(record: CampaignView) {
  return record.canChangeMode === undefined
    ? undefined
    : record.status === "inactive" &&
        !previouslyActivated.has(record.id) &&
        !linkedCoupons.has(record.id);
}
export function couponPromotionChoices() {
  return records
    .filter((item) => item.configuration.mode === "coupon")
    .map((item) => ({
      id: item.id,
      name: item.name,
      mode: "coupon" as const,
      validFrom: `${item.configuration.validFrom}:00-05:00`,
      validUntil: `${item.configuration.validUntil}:00-05:00`,
    }));
}
export function markCampaignCouponLinked(id: string) {
  linkedCoupons.add(id);
  const item = records.find((row) => row.id === id);
  if (item) item.canChangeMode = false;
}
export const mockCampaignRepository: CampaignRepository = {
  async list(query, scenario, signal) {
    await checkAdministrationRead(scenario, signal);
    signal.throwIfAborted();
    return pageOf(
      scenario === "empty"
        ? []
        : records.filter(
            (item) =>
              (query.status === "all" || item.status === query.status) &&
              (query.kind === "all" || item.configuration.mode === query.kind),
          ),
      query.page,
      query.pageSize,
    );
  },
  async read(id, scenario, signal) {
    await checkAdministrationRead(scenario, signal);
    signal.throwIfAborted();
    const record =
      scenario === "missing"
        ? undefined
        : records.find((item) => item.id === id);
    if (!record) return null;
    return structuredClone({
      ...record,
      canChangeMode:
        scenario === "unknown-capability" ? undefined : capability(record),
    });
  },
  async save(id, draft, scenario, signal) {
    await checkAdministrationWrite(scenario, signal);
    signal.throwIfAborted();
    const errors = campaignErrors(draft);
    if (
      draft.productIds.some(
        (value) =>
          !catalogProducts.some((item) => item.id === value && item.active),
      ) ||
      draft.skus.some(
        (value) =>
          !catalogProducts.some(
            (item) =>
              item.active &&
              item.skus.some((sku) => sku.sku === value && sku.active),
          ),
      )
    )
      errors.scope =
        "El alcance incluye una referencia no disponible o inactiva.";
    const original = id ? records.find((item) => item.id === id) : null;
    if (id && !original)
      throw new AdministrationError(
        "rejected",
        "La promoción no está disponible para editar.",
      );
    if (
      original &&
      draft.mode !== original.configuration.mode &&
      capability(original) !== true
    )
      errors.mode =
        "No está permitido cambiar la modalidad. Crea otra promoción.";
    if (Object.keys(errors).length)
      throw new AdministrationError(
        "validation",
        "Revisa los campos indicados. El borrador se conserva.",
        errors,
      );
    if (draft.status !== "active" && draft.status !== "inactive")
      throw new AdministrationError(
        "validation",
        "Selecciona un estado inicial.",
      );
    const record: CampaignView = {
      id: id ?? `promocion-demo-${++sequence}`,
      name: draft.name.trim(),
      status: original?.status ?? draft.status,
      canChangeMode: original?.canChangeMode ?? true,
      configuration: {
        ...structuredClone(draft),
        name: draft.name.trim(),
        status: original?.status ?? draft.status,
        benefit: draft.benefit.trim().replace(",", "."),
        channels: [...new Set(draft.channels)],
        productIds: [...new Set(draft.productIds)],
        skus: [...new Set(draft.skus)],
      },
    };
    if (record.status === "active") previouslyActivated.add(record.id);
    record.canChangeMode = capability(record);
    if (id) records[records.findIndex((item) => item.id === id)] = record;
    else records.push(record);
    return administrationResponse(record, scenario);
  },
  async changeStatus(id, status, scenario, signal) {
    await checkAdministrationWrite(scenario, signal);
    signal.throwIfAborted();
    const index = records.findIndex((item) => item.id === id);
    const original = records[index];
    if (!original)
      throw new AdministrationError(
        "rejected",
        "La promoción no está disponible.",
      );
    const record = {
      ...original,
      status,
      configuration: { ...original.configuration, status },
    };
    if (status === "active") previouslyActivated.add(id);
    record.canChangeMode = capability(record);
    records[index] = record;
    return administrationResponse(record, scenario);
  },
};
