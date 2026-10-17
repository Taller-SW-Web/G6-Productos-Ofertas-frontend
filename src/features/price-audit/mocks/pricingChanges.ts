import type { PriceTarget, PriceView } from "../../pricing/services/pricingRepository";
import { decimalLess } from "../../pricing/services/pricingValidation";
import type { AuditEntry } from "../services/auditRepository";

// Browser-session demo only. Never imported by API composition or persisted.
export function createMockPricingAudit() {
  const entries: AuditEntry[] = [];
  let sequence = 0;
  return {
    read: () => structuredClone(entries),
    record(target: PriceTarget, before: PriceView, after: PriceView, reason: string) {
      const sku = target.kind === "variant" ? target.sku : target.referenceSku;
      if (!sku) return; // A product ID is never substituted for an unknown SKU.
      for (const priceType of ["REGULAR", "OFERTA"] as const) {
        const previous = priceType === "REGULAR" ? before.regular : before.offer;
        const next = priceType === "REGULAR" ? after.regular : after.offer;
        if (previous === next || (previous !== null && next !== null &&
          !decimalLess(previous, next) && !decimalLess(next, previous))) continue;
        entries.unshift({
          id: `demo-pricing-${++sequence}-v${after.version}`,
          sku,
          productId: target.productId,
          priceType,
          before: previous,
          after: next,
          variation: previous === null || next === null ? null : percentage(previous, next),
          operation: next === null ? "RETIRO_OFERTA" : previous === null ? "CREACION" : "MODIFICACION",
          origin: "BACKOFFICE",
          reason,
          batchId: null,
          actorId: "demo-pricing",
          email: null,
          ip: null,
          at: after.validFrom,
        });
      }
    },
  };
}

function percentage(before: string, after: string) {
  const precision = Math.max(before.split(".")[1]?.length ?? 0, after.split(".")[1]?.length ?? 0);
  const units = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole + fraction.padEnd(precision, "0"));
  };
  const previous = units(before);
  // Demo variation truncated to four decimals; price strings remain unchanged.
  const value = (units(after) - previous) * 1_000_000n / previous;
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 10_000n}.${String(absolute % 10_000n).padStart(4, "0")}`;
}

export const mockPricingAudit = createMockPricingAudit();
