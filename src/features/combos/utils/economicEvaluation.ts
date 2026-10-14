import type {
  ComponentPricingSnapshot,
  EconomicComparisonResult,
} from "../types/combos";

export interface EconomicEvaluationInputComponent {
  sku: string;
  quantity: number;
}

export interface EconomicEvaluationOptions {
  allowRoundingPrecisionCheck?: boolean;
}

/**
 * Validates decimal precision. In standard currency (e.g. PEN), amounts cannot have
 * more than 2 decimal digits (e.g. 10.555 is invalid precision).
 */
export function isValidCurrencyPrecision(amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  // Convert to string and test decimal places
  const str = amount.toString();
  if (str.includes(".")) {
    const decimals = str.split(".")[1];
    return decimals ? decimals.length <= 2 : true;
  }
  return true;
}

/**
 * Converts a currency amount to integer cents (e.g. 14.50 -> 1450).
 * Rejects non-finite numbers or values with more than 2 decimal places.
 */
export function toCents(amount: number): number | null {
  if (!isValidCurrencyPrecision(amount)) return null;
  return Math.round(amount * 100);
}

/**
 * Domain utility to evaluate the economic benefit of a combo per SPEC-002:
 *
 * 1. sumaRegular = sum(precio_regular * cantidad)
 * 2. sumaPublicaVigente = sum(precio_publico_vigente * cantidad)
 * 3. Validation:
 *    - All components must have available pricing with valid currency.
 *    - All currencies must be compatible (e.g. all PEN).
 *    - No price can have unauthorized decimal precision (> 2 decimals).
 *    - Combo price must be strictly positive (> 0).
 *    - Combo price must be strictly less than both sumaRegular and sumaPublicaVigente.
 *      (Strict inequality in integer cents avoids floating point rounding anomalies).
 */
export function evaluateComboEconomicBenefit(
  components: EconomicEvaluationInputComponent[],
  comboPrice: number,
  pricingMap: Record<string, ComponentPricingSnapshot>,
): EconomicComparisonResult {
  // Check combo price precision
  if (!isValidCurrencyPrecision(comboPrice)) {
    return {
      regularSum: 0,
      publicSum: 0,
      comboPrice,
      isValidBenefit: false,
      isPricingComplete: false,
      currency: "PEN",
      message: "La precisión del precio del combo no es válida (máximo 2 decimales).",
    };
  }

  const comboCents = toCents(comboPrice);

  let regularCentsTotal = 0;
  let publicCentsTotal = 0;
  let isPricingComplete = true;
  let dominantCurrency: string | null = null;
  let currencyMismatch = false;

  for (const comp of components) {
    const pricing = pricingMap[comp.sku];
    if (!pricing || !pricing.available || !pricing.currency) {
      isPricingComplete = false;
      continue;
    }

    if (!isValidCurrencyPrecision(pricing.regularPrice) || !isValidCurrencyPrecision(pricing.publicPrice)) {
      isPricingComplete = false;
      continue;
    }

    // Check currency compatibility
    if (dominantCurrency === null) {
      dominantCurrency = pricing.currency;
    } else if (dominantCurrency !== pricing.currency) {
      currencyMismatch = true;
      break;
    }

    const regCents = toCents(pricing.regularPrice);
    const pubCents = toCents(pricing.publicPrice);

    if (regCents === null || pubCents === null || regCents <= 0 || pubCents <= 0) {
      isPricingComplete = false;
      continue;
    }

    regularCentsTotal += regCents * comp.quantity;
    publicCentsTotal += pubCents * comp.quantity;
  }

  const finalCurrency = dominantCurrency || "PEN";

  if (currencyMismatch) {
    return {
      regularSum: 0,
      publicSum: 0,
      comboPrice,
      isValidBenefit: false,
      isPricingComplete: false,
      currency: finalCurrency,
      message: "Conflicto de monedas: los componentes tienen monedas incompatibles entre sí.",
    };
  }

  const regularSum = regularCentsTotal / 100;
  const publicSum = publicCentsTotal / 100;

  if (!isPricingComplete) {
    return {
      regularSum,
      publicSum,
      comboPrice,
      isValidBenefit: false,
      isPricingComplete: false,
      currency: finalCurrency,
      message: "No se puede confirmar la comparación económica porque faltan precios de uno o más componentes.",
    };
  }

  if (comboCents === null || comboCents <= 0) {
    return {
      regularSum,
      publicSum,
      comboPrice,
      isValidBenefit: false,
      isPricingComplete: true,
      currency: finalCurrency,
      message: "El precio del combo debe ser mayor a cero.",
    };
  }

  // Strict inequality check in integer cents
  const strictlyLessThanRegular = comboCents < regularCentsTotal;
  const strictlyLessThanPublic = comboCents < publicCentsTotal;
  const isValidBenefit = strictlyLessThanRegular && strictlyLessThanPublic;

  let message: string;
  if (!isValidBenefit) {
    message = "El precio del combo debe ser estrictamente menor que la suma regular y que la suma pública vigente de sus componentes.";
  } else {
    message = "El precio propuesto es menor que ambas referencias actuales.";
  }

  return {
    regularSum,
    publicSum,
    comboPrice,
    isValidBenefit,
    isPricingComplete: true,
    currency: finalCurrency,
    message,
  };
}
