import { describe, expect, it } from "vitest";
import { availabilityMessage } from "./availability";
import { compareComboPrice, parseMoneyMinor, resolveProductSkus, validateComposition } from "./comboRules";
import { MockCombosRepository } from "../adapters/mockCombosRepository";
import { productFixtures, priceFixtures } from "../mocks/comboFixtures";
import { ComboError } from "../types/combos";
import type { Combo, ComboDraft } from "../types/combos";

const components = [
  { sku: "INKA-BAND-01", productName: "Bandas", quantity: 1 },
  { sku: "INKA-MAT-01", productName: "Mat", quantity: 1 },
];
const draft: ComboDraft = { name: "Prueba", description: "", components, price: "120.00" };
const simpleProduct = productFixtures[0]!;
const variantProduct = productFixtures[4]!;
const firstComponent = components[0]!;
const secondComponent = components[1]!;

describe("resolución producto a SKU", () => {
  it("usa sku_base del producto simple y exige SKU explícito para variantes", () => {
    expect(resolveProductSkus(simpleProduct)).toEqual(["INKA-BAND-01"]);
    expect(resolveProductSkus(variantProduct)).toEqual(["INKA-BAND-02", "INKA-BAND-03"]);
    expect(resolveProductSkus({ ...simpleProduct, active: false })).toEqual([]);
  });
});

describe("validación de composición", () => {
  it("requiere dos SKU distintos y cantidades enteras positivas", () => {
    expect(validateComposition({ components: [firstComponent] })).toContain("Agrega al menos dos SKU vendibles.");
    expect(validateComposition({ components: [firstComponent, { ...secondComponent, sku: firstComponent.sku }] })).toContain("Cada SKU debe aparecer una sola vez.");
    expect(validateComposition({ components: [firstComponent, { ...secondComponent, quantity: 1.5 }] })).toContain("La cantidad de cada componente debe ser un entero igual o mayor que 1.");
    expect(validateComposition(draft)).toEqual([]);
  });
});

describe("comparación económica en centavos", () => {
  it("usa enteros para comparar las sumas regular y pública vigentes", () => {
    expect(parseMoneyMinor("120,05")).toBe(12005);
    expect(compareComboPrice(components.map((item) => ({ ...item, regularUnitMinor: 0, publicUnitMinor: 0 })), "120.00", priceFixtures)).toMatchObject({ status: "ready", regularMinor: 16980, publicMinor: 14980, valid: true });
  });

  it("rechaza superar cualquiera de las dos sumas y no inventa precio ante falta de Pricing", () => {
    expect(compareComboPrice(components.map((item) => ({ ...item, regularUnitMinor: 0, publicUnitMinor: 0 })), "170.00", priceFixtures)).toMatchObject({ valid: false, reason: "El precio debe ser menor que la suma de precios regulares." });
    expect(compareComboPrice(components.map((item) => ({ ...item, regularUnitMinor: 0, publicUnitMinor: 0 })), "150.00", priceFixtures)).toMatchObject({ valid: false, reason: "El precio debe ser menor que la suma de precios públicos vigentes." });
    expect(compareComboPrice(components.map((item) => ({ ...item, regularUnitMinor: 0, publicUnitMinor: 0 })), "100.00", [])).toMatchObject({ status: "unavailable" });
    expect(compareComboPrice(components.map((item) => ({ ...item, regularUnitMinor: 0, publicUnitMinor: 0 })), "0", priceFixtures)).toMatchObject({ valid: false });
  });
});

describe("disponibilidad informativa", () => {
  const base: Combo = {
    id: "c", name: "Combo", description: null, status: "ACTIVO", priceMinor: 1000, version: 1,
    components: [], availability: { verifiable: true, quantity: 0, freshness: "ACTUALIZADA", calculatedAt: null },
  };
  it("separa agotado, inactivo, null, incompleto y desactualizado", () => {
    expect(availabilityMessage(base).label).toBe("Agotado actualmente");
    expect(availabilityMessage({ ...base, status: "INACTIVO" }).label).toBe("No disponible para nuevas ventas");
    expect(availabilityMessage({ ...base, availability: { ...base.availability, quantity: null } }).label).toBe("No se puede confirmar la disponibilidad actual.");
    expect(availabilityMessage({ ...base, availability: { ...base.availability, quantity: 4, freshness: "INCOMPLETA" } }).label).toBe("Disponibilidad incompleta");
    expect(availabilityMessage({ ...base, availability: { ...base.availability, freshness: "DESACTUALIZADA" } }).label).toBe("Disponibilidad desactualizada");
  });
});

describe("adapter mock", () => {
  it("lista, crea, actualiza, desactiva y reporta el conflicto de versión conservando la versión actual", async () => {
    const repository = new MockCombosRepository();
    expect((await repository.list({ status: "TODOS", page: 1, pageSize: 5 })).total).toBe(3);
    const created = await repository.create({ name: "Combo prueba", description: null, components: [{ sku: "INKA-BAND-01", quantity: 1 }, { sku: "INKA-MAT-01", quantity: 1 }], priceMinor: 10000 });
    expect(created.status).toBe("ACTIVO");
    const updated = await repository.update(created.id, { name: "Combo prueba editado", description: null, components: [{ sku: "INKA-BAND-01", quantity: 1 }, { sku: "INKA-MAT-01", quantity: 1 }], priceMinor: 9000, version: created.version });
    expect(updated.version).toBe(created.version + 1);
    await expect(repository.update(updated.id, { name: "x", description: null, components: [], priceMinor: 1000, version: updated.version }, "version-conflict")).rejects.toMatchObject({ kind: "version_conflict", currentVersion: { id: updated.id } });
    await expect(repository.create({ name: "x", description: null, components: [], priceMinor: 1000 }, "server-price-rejected")).rejects.toBeInstanceOf(ComboError);
    expect((await repository.deactivate(updated.id)).status).toBe("INACTIVO");
  });
});
