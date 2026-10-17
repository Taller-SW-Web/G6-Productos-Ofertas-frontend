import type { PriceTarget, PriceView } from "../../pricing/services/pricingRepository";
import { decimalLess } from "../../pricing/services/pricingValidation";
import type { AuditEntry } from "../services/auditRepository";
import {
  isMockPersistenceAvailable,
  isRecord,
  publishMockChange,
  readMockState,
  saveMockState,
  subscribeExternalMockChanges,
} from "../../shared/mockState";

interface MockPricingAuditState {
  entries: AuditEntry[];
  sequence: number;
}

function isAuditEntryRecord(value: unknown): value is AuditEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sku === "string" &&
    typeof value.productId === "string" &&
    typeof value.priceType === "string" &&
    typeof value.at === "string"
  );
}

function isMockPricingAuditState(value: unknown): value is MockPricingAuditState {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isAuditEntryRecord) &&
    typeof value.sequence === "number"
  );
}

// Demonstration audit log fed by confirmed Precios edits. It is only restored and
// persisted inside the mock browser demonstration; API composition never imports it.
export function createMockPricingAudit(options: { persist?: boolean } = {}) {
  const persistEnabled = options.persist === true && isMockPersistenceAvailable();
  const restored = persistEnabled
    ? readMockState<MockPricingAuditState>("price-audit", isMockPricingAuditState)
    : null;
  const entries: AuditEntry[] = restored ? restored.entries : [];
  let sequence = restored ? restored.sequence : 0;

  // A non-persistent instance (persist: false) must never touch `localStorage`.
  function persist() {
    if (persistEnabled) {
      saveMockState("price-audit", { entries, sequence } satisfies MockPricingAuditState);
    }
    publishMockChange("price-audit");
  }

  if (persistEnabled) {
    subscribeExternalMockChanges("price-audit", () => {
      const next = readMockState<MockPricingAuditState>("price-audit", isMockPricingAuditState);
      if (!next) return;
      entries.length = 0;
      entries.push(...next.entries);
      sequence = next.sequence;
      publishMockChange("price-audit");
    });
  }

  return {
    read: () => structuredClone(entries),
    record(target: PriceTarget, before: PriceView, after: PriceView, reason: string) {
      const sku = target.kind === "variant" ? target.sku : target.referenceSku;
      if (!sku) return; // A product ID is never substituted for an unknown SKU.
      let changed = false;
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
        changed = true;
      }
      if (changed) persist();
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

export const mockPricingAudit = createMockPricingAudit({ persist: true });
