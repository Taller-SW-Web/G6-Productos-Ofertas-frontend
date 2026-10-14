import { test, expect } from "@playwright/test";
import {
  evaluateComboEconomicBenefit,
  isValidCurrencyPrecision,
  toCents,
} from "../src/features/combos/utils/economicEvaluation";
import type { ComponentPricingSnapshot } from "../src/features/combos/types/combos";

test.describe("MK-002 — Dominio: Evaluación Económica y Precisión Decimal Segura", () => {
  test("Validación de precisión decimal (máximo 2 decimales)", () => {
    expect(isValidCurrencyPrecision(100)).toBe(true);
    expect(isValidCurrencyPrecision(100.5)).toBe(true);
    expect(isValidCurrencyPrecision(100.55)).toBe(true);
    expect(isValidCurrencyPrecision(100.555)).toBe(false);
    expect(isValidCurrencyPrecision(NaN)).toBe(false);
    expect(isValidCurrencyPrecision(Infinity)).toBe(false);

    expect(toCents(100.55)).toBe(10055);
    expect(toCents(100.555)).toBe(null);
  });

  test("Rechaza importes con precisión no permitida (> 2 decimales)", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 90, currency: "PEN", available: true },
      SKU2: { sku: "SKU2", regularPrice: 50, publicPrice: 40, currency: "PEN", available: true },
    };

    const res = evaluateComboEconomicBenefit(
      [
        { sku: "SKU1", quantity: 1 },
        { sku: "SKU2", quantity: 1 },
      ],
      120.555,
      pricingMap,
    );

    expect(res.isValidBenefit).toBe(false);
    expect(res.message).toContain("máximo 2 decimales");
  });

  test("Precios límite: comboPrice == publicSum o comboPrice == regularSum es rechazado estrictamente", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 80, currency: "PEN", available: true },
      SKU2: { sku: "SKU2", regularPrice: 50, publicPrice: 40, currency: "PEN", available: true },
    };
    // Regular = 150, Public = 120

    // Exact match with public sum (120) -> should be rejected!
    const resEqualPublic = evaluateComboEconomicBenefit(
      [
        { sku: "SKU1", quantity: 1 },
        { sku: "SKU2", quantity: 1 },
      ],
      120.0,
      pricingMap,
    );
    expect(resEqualPublic.isValidBenefit).toBe(false);
    expect(resEqualPublic.message).toContain("menor que la suma regular y que la suma pública vigente");

    // Strictly lower (119.99) -> approved
    const resLower = evaluateComboEconomicBenefit(
      [
        { sku: "SKU1", quantity: 1 },
        { sku: "SKU2", quantity: 1 },
      ],
      119.99,
      pricingMap,
    );
    expect(resLower.isValidBenefit).toBe(true);
    expect(resLower.message).toContain("menor que ambas referencias");
  });

  test("Rechaza monedas incompatibles entre componentes (PEN vs USD)", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 80, currency: "PEN", available: true },
      SKU2: { sku: "SKU2", regularPrice: 50, publicPrice: 40, currency: "USD", available: true },
    };

    const res = evaluateComboEconomicBenefit(
      [
        { sku: "SKU1", quantity: 1 },
        { sku: "SKU2", quantity: 1 },
      ],
      100.0,
      pricingMap,
    );

    expect(res.isValidBenefit).toBe(false);
    expect(res.isPricingComplete).toBe(false);
    expect(res.message).toContain("Conflicto de monedas");
  });

  test("Precios incompletos o faltantes nunca otorgan aprobación falsa", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 80, currency: "PEN", available: true },
      SKU2: { sku: "SKU2", regularPrice: 0, publicPrice: 0, currency: "PEN", available: false },
    };

    const res = evaluateComboEconomicBenefit(
      [
        { sku: "SKU1", quantity: 1 },
        { sku: "SKU2", quantity: 1 },
      ],
      50.0,
      pricingMap,
    );

    expect(res.isValidBenefit).toBe(false);
    expect(res.isPricingComplete).toBe(false);
    expect(res.message).toContain("faltan precios de uno o más componentes");
  });

  test("Cantidades extremas o no seguras son rechazadas (Number.isSafeInteger)", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 80, currency: "PEN", available: true },
    };

    // Unsafe integer > MAX_SAFE_INTEGER
    const resUnsafe = evaluateComboEconomicBenefit(
      [{ sku: "SKU1", quantity: Number.MAX_SAFE_INTEGER + 10 }],
      50.0,
      pricingMap,
    );
    expect(resUnsafe.isValidBenefit).toBe(false);
    expect(resUnsafe.message).toContain("entero positivo seguro");

    // Zero or negative quantity
    const resZero = evaluateComboEconomicBenefit(
      [{ sku: "SKU1", quantity: 0 }],
      50.0,
      pricingMap,
    );
    expect(resZero.isValidBenefit).toBe(false);
    expect(resZero.message).toContain("entero positivo seguro");
  });

  test("Ausencia de moneda nunca genera 'PEN' por fallback arbitrario", () => {
    const pricingMap: Record<string, ComponentPricingSnapshot> = {
      SKU1: { sku: "SKU1", regularPrice: 100, publicPrice: 80, currency: "", available: false },
    };

    const res = evaluateComboEconomicBenefit(
      [{ sku: "SKU1", quantity: 1 }],
      50.0,
      pricingMap,
    );

    expect(res.currency).toBe("");
    expect(res.currency).not.toBe("PEN");
  });
});
