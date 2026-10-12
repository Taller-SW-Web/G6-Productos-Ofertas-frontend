import type { PriceTarget, PriceView } from "../services/pricingRepository";

// The October 17 exposition is a deterministic environment, not the application clock.
export const demoNow = "2026-10-17T12:00:00Z";
export const priceTargets: PriceTarget[] = [
  {
    id: "base",
    label: "Zapatilla Trail Inka Explorer · Producto base",
    productId: "fixture-product-013",
    kind: "product",
    referenceSku: "ZAP-TRL-EXP",
  },
  {
    id: "variant40",
    label: "Talla 40 · Negro — ZAP-TRL-40-BLK",
    productId: "fixture-product-013",
    kind: "variant",
    sku: "ZAP-TRL-40-BLK",
    productTargetId: "base",
  },
  {
    id: "variant41",
    label: "Talla 41 · Negro — ZAP-TRL-41-BLK",
    productId: "fixture-product-013",
    kind: "variant",
    sku: "ZAP-TRL-41-BLK",
    productTargetId: "base",
  },
  {
    id: "override42",
    label: "Talla 42 · Negro — ZAP-TRL-42-BLK",
    productId: "fixture-product-013",
    kind: "variant",
    sku: "ZAP-TRL-42-BLK",
    productTargetId: "base",
  },
];
export const targetNames: Record<string, string> = {
  base: "Zapatilla Trail Inka Explorer",
  variant40: "Talla 40 · Negro",
  variant41: "Talla 41 · Negro",
  override42: "Talla 42 · Negro",
};
export const priceRecords: PriceView[] = [
  {
    id: "base",
    name: targetNames.base!,
    regular: "100.00",
    offer: "90.00",
    currency: "PEN",
    version: 3,
    origin: "product",
    channel: "global",
    validFrom: "2026-09-01T00:00:00Z",
    validUntil: "2026-10-01T00:00:00Z",
    inherited: false,
  },
  {
    id: "base",
    name: targetNames.base!,
    regular: "249.90",
    offer: "219.90",
    currency: "PEN",
    version: 4,
    origin: "product",
    channel: "global",
    validFrom: "2026-10-01T00:00:00Z",
    validUntil: "2026-11-01T00:00:00Z",
    inherited: false,
  },
  {
    id: "base",
    name: targetNames.base!,
    regular: "249.90",
    offer: null,
    currency: "PEN",
    version: 5,
    origin: "product",
    channel: "global",
    validFrom: "2026-11-01T00:00:00Z",
    validUntil: null,
    inherited: false,
  },
  {
    id: "override42",
    name: targetNames.override42!,
    sku: "ZAP-TRL-42-BLK",
    regular: "259.90",
    offer: null,
    currency: "PEN",
    version: 6,
    origin: "sku",
    channel: "global",
    validFrom: "2026-09-01T00:00:00Z",
    validUntil: null,
    inherited: false,
  },
];
// Foundation-only composition examples. They never populate product views.
export const sampleSchedules = [
  {
    id: "schedule-01",
    kind: "Oferta",
    amount: "S/ 189.90 PEN",
    start: "25/11/2026 00:00",
    end: "30/11/2026 23:59",
    status: "Programado",
  },
  {
    id: "schedule-02",
    kind: "Oferta",
    amount: "S/ 199.90 PEN",
    start: "15/12/2026 00:00",
    end: "25/12/2026 23:59",
    status: "Programado",
  },
];
export const sampleImportRows = [
  {
    id: "1",
    sku: "CAM-BASE",
    status: "Confirmada",
    failed: false,
    detail: "Sin error reportado",
  },
  {
    id: "2",
    sku: "CAM-AZ-M",
    status: "Confirmada",
    failed: false,
    detail: "Sin error reportado",
  },
  {
    id: "3",
    sku: "CAM-RO-L",
    status: "Rechazada",
    failed: true,
    detail: "La oferta debe ser menor que el precio regular",
  },
];
