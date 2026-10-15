import type { Combo, ProductCandidate, SkuPrice } from "../types/combos";

const availability = (quantity: number | null, freshness: Combo["availability"]["freshness"] = "ACTUALIZADA", verifiable = true) => ({
  verifiable,
  quantity,
  freshness,
  calculatedAt: "2026-10-14T16:00:00-05:00",
});

export const comboFixtures: Combo[] = [
  {
    id: "combo-entrenamiento",
    name: "Set de entrenamiento esencial",
    description: "Accesorios básicos para comenzar una rutina de fuerza.",
    status: "ACTIVO",
    priceMinor: 12990,
    version: 3,
    components: [
      { sku: "INKA-BAND-01", productName: "Bandas de resistencia", quantity: 1, regularUnitMinor: 7990, publicUnitMinor: 6990 },
      { sku: "INKA-MAT-01", productName: "Mat de entrenamiento", quantity: 1, regularUnitMinor: 8990, publicUnitMinor: 7990 },
    ],
    availability: availability(8),
  },
  {
    id: "combo-yoga",
    name: "Kit yoga diario",
    description: "Mat y bloque para práctica diaria.",
    status: "ACTIVO",
    priceMinor: 11990,
    version: 1,
    components: [
      { sku: "INKA-MAT-01", productName: "Mat de entrenamiento", quantity: 1, regularUnitMinor: 8990, publicUnitMinor: 7990 },
      { sku: "INKA-BLOCK-02", productName: "Bloque de yoga", quantity: 2, regularUnitMinor: 2990, publicUnitMinor: 2490 },
    ],
    availability: availability(0),
  },
  {
    id: "combo-resistencia",
    name: "Pack resistencia Pro",
    description: "Bandas y cuerda de salto.",
    status: "INACTIVO",
    priceMinor: 9990,
    version: 2,
    components: [
      { sku: "INKA-BAND-02", productName: "Bandas Pro", quantity: 1, regularUnitMinor: 7990, publicUnitMinor: 7490 },
      { sku: "INKA-ROPE-01", productName: "Cuerda de salto", quantity: 1, regularUnitMinor: 5990, publicUnitMinor: 4990 },
    ],
    availability: availability(null, "INCOMPLETA", false),
  },
];

export const productFixtures: ProductCandidate[] = [
  { productId: "product-band", name: "Bandas de resistencia", hasVariants: false, active: true, baseSku: "INKA-BAND-01", variants: [] },
  { productId: "product-mat", name: "Mat de entrenamiento", hasVariants: false, active: true, baseSku: "INKA-MAT-01", variants: [] },
  { productId: "product-block", name: "Bloque de yoga", hasVariants: false, active: true, baseSku: "INKA-BLOCK-02", variants: [] },
  { productId: "product-rope", name: "Cuerda de salto", hasVariants: false, active: true, baseSku: "INKA-ROPE-01", variants: [] },
  { productId: "product-bands-variant", name: "Bandas Pro por resistencia", hasVariants: true, active: true, baseSku: null, variants: [
    { sku: "INKA-BAND-02", label: "Fuerte · INKA-BAND-02", active: true },
    { sku: "INKA-BAND-03", label: "Ligera · INKA-BAND-03", active: true },
  ] },
];

export const priceFixtures: SkuPrice[] = [
  { sku: "INKA-BAND-01", regularMinor: 7990, publicMinor: 6990, currency: "PEN" },
  { sku: "INKA-MAT-01", regularMinor: 8990, publicMinor: 7990, currency: "PEN" },
  { sku: "INKA-BLOCK-02", regularMinor: 2990, publicMinor: 2490, currency: "PEN" },
  { sku: "INKA-ROPE-01", regularMinor: 5990, publicMinor: 4990, currency: "PEN" },
  { sku: "INKA-BAND-02", regularMinor: 7990, publicMinor: 7490, currency: "PEN" },
  { sku: "INKA-BAND-03", regularMinor: 6990, publicMinor: 5990, currency: "PEN" },
];
