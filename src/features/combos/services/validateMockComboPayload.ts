import { effectivePublicMinor } from "./comboRules";
import { comboFixtures, productDetails, productFixtures, priceFixtures } from "../mocks/comboFixtures";
import { ComboError, type ComboPayload, type ProductDetail, type ProductSummary, type SkuPrice } from "../types/combos";

const DEMO_CURRENCY = "PEN";

function isValidDate(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function isEffectivePrice(price: SkuPrice, now: number): boolean {
  const start = Date.parse(price.validFrom);
  const end = price.validUntil === null ? Number.POSITIVE_INFINITY : Date.parse(price.validUntil);
  return isValidDate(price.validFrom) && start <= now &&
    (price.validUntil === null || (isValidDate(price.validUntil) && end > now));
}

export function validateMockComboPayload(
  payload: ComboPayload,
  catalog: ProductSummary[] = productFixtures,
  details: ProductDetail[] = productDetails,
  prices: SkuPrice[] = priceFixtures,
  existingComboIds: string[] = comboFixtures.map((combo) => combo.id),
): void {
  if (!payload.name.trim()) {
    throw new ComboError("invalid_components", "Ingresa el nombre del combo.");
  }
  if (payload.components.length < 2) {
    throw new ComboError("invalid_components", "Un combo requiere al menos dos SKU vendibles directos.");
  }

  const skus = payload.components.map((component) => component.sku);
  if (skus.some((sku) => existingComboIds.includes(sku))) {
    throw new ComboError("nested_combo", "No se permite agregar un combo como componente.");
  }
  if (new Set(skus).size !== skus.length) {
    throw new ComboError("duplicate_sku", "Cada SKU debe aparecer una sola vez en el combo.");
  }
  if (payload.components.some(({ quantity }) => !Number.isSafeInteger(quantity) || quantity < 1)) {
    throw new ComboError("invalid_quantity", "La cantidad de cada componente debe ser un entero positivo.");
  }

  for (const { sku } of payload.components) {
    const knownProduct = catalog.find((product) =>
      product.hasVariants
        ? details.find((detail) => detail.productId === product.productId)?.variants.some((variant) => variant.sku === sku)
        : product.baseSku === sku,
    );
    const owner = catalog.find((product) =>
      product.active && (product.hasVariants
        ? details.find((detail) => detail.productId === product.productId)?.variants.some((variant) => variant.active && variant.sku === sku)
        : product.baseSku === sku),
    );
    if (!owner) {
      if (!knownProduct) throw new ComboError("sku_not_found", `El SKU ${sku} no existe en el catálogo.`);
      throw new ComboError("sku_invalid", `El SKU ${sku} no pertenece a un producto y una variante activos del catálogo.`);
    }
  }

  if (!Number.isSafeInteger(payload.priceMinor) || payload.priceMinor <= 0) {
    throw new ComboError("price_invalid", "El precio del combo debe ser mayor que cero.");
  }

  const selectedPrices = payload.components.map(({ sku }) => prices.filter((price) => price.sku === sku));
  if (selectedPrices.some((matches) => matches.length !== 1)) {
    throw new ComboError("pricing_unavailable", "No se pudo confirmar una referencia vigente de Pricing para cada SKU.");
  }

  const references = selectedPrices.map((matches) => matches[0]!);
  const referenceCurrency = references[0]?.currency;
  if (!referenceCurrency || referenceCurrency !== DEMO_CURRENCY || references.some((price) =>
    price.currency !== referenceCurrency || price.channelId !== null ||
    !Number.isSafeInteger(price.priceVersion) || price.priceVersion < 0 ||
    !price.validityId.trim() || !isEffectivePrice(price, Date.now()) ||
    price.regularMinor === null || !Number.isSafeInteger(price.regularMinor) || price.regularMinor <= 0 ||
    (price.offerMinor !== null && (!Number.isSafeInteger(price.offerMinor) || price.offerMinor <= 0)),
  )) {
    throw new ComboError("pricing_unavailable", "Las referencias de Pricing no son vigentes, globales o compatibles en moneda.");
  }

  let regularTotal = 0;
  let publicTotal = 0;
  payload.components.forEach((component, index) => {
    const reference = references[index]!;
    const effectivePublic = effectivePublicMinor(reference);
    if (effectivePublic === null) {
      throw new ComboError("pricing_unavailable", "No se pudo determinar el precio público vigente de todos los SKU.");
    }
    regularTotal += reference.regularMinor! * component.quantity;
    publicTotal += effectivePublic * component.quantity;
  });

  if (!Number.isSafeInteger(regularTotal) || !Number.isSafeInteger(publicTotal)) {
    throw new ComboError("pricing_unavailable", "Las sumas de referencia exceden el rango seguro de comparación.");
  }
  if (payload.priceMinor >= regularTotal || payload.priceMinor >= publicTotal) {
    throw new ComboError("price_invalid", "El precio del combo debe ser menor que la suma regular y la suma pública vigente.");
  }
}
