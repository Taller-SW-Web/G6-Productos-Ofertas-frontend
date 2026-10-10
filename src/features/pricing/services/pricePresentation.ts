import type { PriceView } from "./pricingRepository";

export function priceOriginLabel(price: PriceView) {
  return price.inherited
    ? "Hereda precio del producto"
    : price.origin === "sku"
      ? "Precio específico del SKU"
      : "Precio del producto";
}
