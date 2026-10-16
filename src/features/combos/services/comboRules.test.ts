import { describe, expect, it } from "vitest";
import { availabilityMessage, hasVerifiedPositiveAvailability } from "./availability";
import { compareComboPrice, parseMoneyMinor, resolveProductSkus, toComparisonComponents, validateComposition } from "./comboRules";
import { parseComboPage } from "./parseComboPage";
import { RequestIdentity } from "./requestIdentity";
import { draftFromCombo, keepDraftAfterVersionConflict } from "./drafts";
import { MockCombosRepository } from "../adapters/mockCombosRepository";
import { comboFixtures, priceFixtures, productDetails } from "../mocks/comboFixtures";
import { ComboError, type Combo, type ComboPayload, type SkuPrice } from "../types/combos";

const components = [
  { sku: "INKA-BAND-01", productName: "Bandas", quantity: 1 },
  { sku: "INKA-MAT-01", productName: "Mat", quantity: 1 },
];
const validPayload: ComboPayload = {
  name: "Combo de prueba",
  description: null,
  components,
  priceMinor: 12000,
};
const base: Combo = {
  id: "c",
  name: "Combo",
  description: null,
  status: "ACTIVO",
  priceMinor: 1000,
  version: 1,
  components: [],
  availability: { verifiable: true, quantity: 0, freshness: "ACTUALIZADA", calculatedAt: null },
};

describe("resolución de producto a SKU", () => {
  it("usa sku_base para producto simple y requiere detalle para seleccionar una variante", () => {
    expect(resolveProductSkus(productDetails[0]!)).toEqual(["INKA-BAND-01"]);
    expect(resolveProductSkus(productDetails.at(-1)!)).toEqual(["INKA-BAND-02", "INKA-BAND-03"]);
    expect(resolveProductSkus({ ...productDetails[0]!, active: false })).toEqual([]);
  });

  it("busca solo productos activos y recupera un error al consultar variantes", async () => {
    const repository = new MockCombosRepository({ failProductSearches: 1, failVariantDetails: ["product-bands-variant"] });
    await expect(repository.listProducts("bandas")).rejects.toMatchObject({ kind: "unavailable" });
    expect(await repository.listProducts("bandas")).toHaveLength(2);
    await expect(repository.getProduct("product-bands-variant")).rejects.toMatchObject({ kind: "unavailable" });
    expect((await repository.getProduct("product-bands-variant"))?.variants.map((variant) => variant.sku)).toEqual(["INKA-BAND-02", "INKA-BAND-03"]);
  });
});

describe("composición y precio preventivo", () => {
  it("requiere dos SKU distintos y cantidades enteras positivas", () => {
    expect(validateComposition({ components: [components[0]!] })).toContain("Agrega al menos dos SKU vendibles.");
    expect(validateComposition({ components: [components[0]!, { ...components[1]!, sku: components[0]!.sku }] })).toContain("Cada SKU debe aparecer una sola vez.");
    expect(validateComposition({ components: [components[0]!, { ...components[1]!, quantity: 1.5 }] })).toContain("La cantidad de cada componente debe ser un entero igual o mayor que 1.");
  });

  it("compara importes enteros y usa el precio regular cuando no hay oferta vigente", () => {
    const noOfferComponents = [
      { sku: "INKA-BAND-02", productName: "Bandas Pro", quantity: 1 },
      { sku: "INKA-ROPE-01", productName: "Cuerda", quantity: 1 },
    ];
    const noOfferPrices = priceFixtures.filter((item) => noOfferComponents.some((component) => component.sku === item.sku));
    const comparison = compareComboPrice(toComparisonComponents(noOfferComponents, noOfferPrices), "120.00", noOfferPrices);
    expect(parseMoneyMinor("120,05")).toBe(12005);
    expect(comparison).toMatchObject({ status: "ready", regularMinor: 13980, publicMinor: 12980, valid: true });
  });

  it("no elige arbitrariamente entre referencias globales vigentes duplicadas", () => {
    const duplicate = { ...priceFixtures[0]!, priceVersion: priceFixtures[0]!.priceVersion + 1, validityId: "otra-vigencia" };
    const ambiguous = [...priceFixtures.filter((price) => price.sku !== duplicate.sku), priceFixtures[0]!, duplicate];
    expect(compareComboPrice(toComparisonComponents(components, ambiguous), "100.00", ambiguous)).toMatchObject({ status: "unavailable" });
  });

  it("rechaza superar la suma regular o pública y no inventa una comparación sin Pricing", () => {
    const mapped = toComparisonComponents(components, priceFixtures);
    expect(compareComboPrice(mapped, "170.00", priceFixtures)).toMatchObject({ valid: false, reason: "El precio debe ser menor que la suma de precios regulares." });
    expect(compareComboPrice(mapped, "150.00", priceFixtures)).toMatchObject({ valid: false, reason: "El precio debe ser menor que la suma de precios públicos vigentes." });
    expect(compareComboPrice(mapped, "100.00", [])).toMatchObject({ status: "unavailable" });
    expect(compareComboPrice(mapped, "0", priceFixtures)).toMatchObject({ valid: false });
  });
});

describe("estados de S04", () => {
  it("distingue disponibilidad positiva, agotada, inactiva y desconocida", () => {
    const positive = { ...base, availability: { ...base.availability, quantity: 4 } };
    const zero = { ...base, availability: { ...base.availability, quantity: 0 } };
    const inactive = { ...positive, status: "INACTIVO" as const };
    const unknown = { ...positive, availability: { ...positive.availability, verifiable: false, quantity: null } };
    expect(hasVerifiedPositiveAvailability(positive)).toBe(true);
    expect(hasVerifiedPositiveAvailability(zero)).toBe(false);
    expect(hasVerifiedPositiveAvailability(inactive)).toBe(false);
    expect(hasVerifiedPositiveAvailability(unknown)).toBe(false);
    expect(availabilityMessage(zero).label).toBe("Agotado actualmente");
    expect(availabilityMessage(inactive).label).toBe("No disponible para nuevas ventas");
    expect(availabilityMessage(unknown).label).toBe("No se puede confirmar la disponibilidad actual.");
    expect(hasVerifiedPositiveAvailability({ ...positive, availability: { ...positive.availability, freshness: "DESACTUALIZADA" } })).toBe(false);
    expect(hasVerifiedPositiveAvailability({ ...positive, availability: { ...positive.availability, freshness: "INCOMPLETA" } })).toBe(false);
  });
});

describe("validación definitiva del adapter mock", () => {
  it("crea una composición válida y devuelve el código canónico para composiciones inválidas", async () => {
    const repository = new MockCombosRepository();
    expect((await repository.create(validPayload)).status).toBe("ACTIVO");
    await expect(repository.create({ ...validPayload, components: [components[0]!] })).rejects.toMatchObject({ code: "COMBO_COMPONENTES_INSUFICIENTES" });
    await expect(repository.create({ ...validPayload, components: [components[0]!, { ...components[1]!, sku: components[0]!.sku }] })).rejects.toMatchObject({ code: "COMBO_COMPONENTE_DUPLICADO" });
    await expect(repository.create({ ...validPayload, components: [components[0]!, { ...components[1]!, sku: "combo-entrenamiento" }] })).rejects.toMatchObject({ code: "COMBO_ANIDADO_NO_PERMITIDO" });
    await expect(repository.create({ ...validPayload, components: [components[0]!, { ...components[1]!, quantity: 1.2 }] })).rejects.toMatchObject({ code: "CANTIDAD_INVALIDA" });
    await expect(repository.create({ ...validPayload, components: [components[0]!, { ...components[1]!, sku: "SKU-UNKNOWN" }] })).rejects.toMatchObject({ code: "SKU_NO_ENCONTRADO" });
    await expect(repository.create({ ...validPayload, priceMinor: 0 })).rejects.toMatchObject({ code: "COMBO_PRECIO_INVALIDO" });
    await expect(repository.create({ ...validPayload, priceMinor: 14980 })).rejects.toMatchObject({ code: "COMBO_PRECIO_INVALIDO" });
    await expect(repository.create({ ...validPayload, priceMinor: 17000 })).rejects.toMatchObject({ code: "COMBO_PRECIO_INVALIDO" });
  });

  it("rechaza monedas, alcances y vigencias incompatibles", async () => {
    const usdPrice = { ...priceFixtures[0]!, currency: "USD" };
    const nonGlobalPrice = { ...priceFixtures[0]!, channelId: "retail" as never };
    const expiredPrice = { ...priceFixtures[0]!, validUntil: "2020-10-02T00:00:00Z" };
    for (const prices of [
      [usdPrice, ...priceFixtures.slice(1)],
      [nonGlobalPrice, ...priceFixtures.slice(1)],
      [expiredPrice, ...priceFixtures.slice(1)],
    ] as SkuPrice[][]) {
      const repository = new MockCombosRepository({ prices });
      await expect(repository.create(validPayload)).rejects.toMatchObject({ kind: "pricing_unavailable" });
    }
  });

  it("resuelve una referencia global vigente aunque existan otros canales o periodos históricos", async () => {
    const globalBand = priceFixtures.find((price) => price.sku === "INKA-BAND-01")!;
    const globalMat = priceFixtures.find((price) => price.sku === "INKA-MAT-01")!;
    const otherChannel = { ...globalBand, channelId: "retail" };
    const historical = { ...globalBand, priceVersion: 0, validityId: "vigencia-anterior", validFrom: "2020-01-01T00:00:00Z", validUntil: "2020-02-01T00:00:00Z" };
    const repository = new MockCombosRepository({ prices: [globalBand, otherChannel, historical, globalMat] });
    expect(await repository.readCurrent(["INKA-BAND-01", "INKA-MAT-01"])).toHaveLength(2);
    expect(await repository.create(validPayload)).toMatchObject({ status: "ACTIVO" });
  });

  it("rechaza referencias globales vigentes ambiguas sin desempatar por versión", async () => {
    const globalBand = priceFixtures.find((price) => price.sku === "INKA-BAND-01")!;
    const globalMat = priceFixtures.find((price) => price.sku === "INKA-MAT-01")!;
    const duplicate = { ...globalBand, priceVersion: globalBand.priceVersion + 1, validityId: "otra-vigencia" };
    const repository = new MockCombosRepository({ prices: [globalBand, duplicate, globalMat] });
    await expect(repository.readCurrent(["INKA-BAND-01"])).resolves.toHaveLength(2);
    await expect(repository.create(validPayload)).rejects.toMatchObject({ kind: "pricing_unavailable" });
  });

  it("usa el regular vigente como referencia pública si no existe oferta efectiva", async () => {
    const band = priceFixtures.find((price) => price.sku === "INKA-BAND-02")!;
    const rope = priceFixtures.find((price) => price.sku === "INKA-ROPE-01")!;
    const repository = new MockCombosRepository({ prices: [band, rope] });
    await expect(repository.create({ ...validPayload, components: [{ sku: band.sku, quantity: 1 }, { sku: rope.sku, quantity: 1 }], priceMinor: 12000 })).resolves.toMatchObject({ status: "ACTIVO" });
  });

  it("rechaza cuando falta el precio global vigente de un SKU", async () => {
    const mat = priceFixtures.find((price) => price.sku === "INKA-MAT-01")!;
    const repository = new MockCombosRepository({ prices: [mat] });
    await expect(repository.create(validPayload)).rejects.toMatchObject({ kind: "pricing_unavailable" });
  });

  it("rechaza referencias vigentes sin vigencia identificable o con versión inválida", async () => {
    const band = priceFixtures.find((price) => price.sku === "INKA-BAND-01")!;
    const mat = priceFixtures.find((price) => price.sku === "INKA-MAT-01")!;
    const invalidReferences = [
      { ...band, validityId: "   " },
      { ...band, priceVersion: -1 },
    ];
    for (const reference of invalidReferences) {
      const repository = new MockCombosRepository({ prices: [reference, mat] });
      await expect(repository.create(validPayload)).rejects.toMatchObject({ kind: "pricing_unavailable" });
    }
  });

  it("valida que una oferta cuyo periodo terminó no sea la referencia pública actual", async () => {
    const band = { ...priceFixtures.find((price) => price.sku === "INKA-BAND-01")!, offerMinor: 100, validUntil: "2020-02-01T00:00:00Z" };
    const mat = priceFixtures.find((price) => price.sku === "INKA-MAT-01")!;
    const repository = new MockCombosRepository({ prices: [band, mat] });
    await expect(repository.readCurrent(["INKA-BAND-01"])).resolves.toEqual([]);
    await expect(repository.create(validPayload)).rejects.toMatchObject({ kind: "pricing_unavailable" });
  });

  it("rechaza SKU de producto inactivo aunque el SKU exista", async () => {
    const inactiveCatalog = productDetails.map((product) => ({ ...product, active: product.productId !== "product-band" }));
    const repository = new MockCombosRepository({ catalog: inactiveCatalog, productDetails: inactiveCatalog });
    await expect(repository.create(validPayload)).rejects.toMatchObject({ code: "SKU_INACTIVO" });
  });

  it("rechaza una edición inválida sin modificar la versión guardada", async () => {
    const repository = new MockCombosRepository();
    const created = await repository.create(validPayload);
    const before = await repository.getById(created.id);
    await expect(repository.update(created.id, { ...validPayload, priceMinor: 14980, version: created.version })).rejects.toMatchObject({ code: "COMBO_PRECIO_INVALIDO" });
    expect(await repository.getById(created.id)).toEqual(before);
  });

  it("invalida disponibilidad al cambiar cantidades o SKU, y la conserva al editar solo el nombre", async () => {
    const repository = new MockCombosRepository();
    const original = await repository.getById("combo-entrenamiento");
    expect(original?.availability).toMatchObject({ verifiable: true, quantity: 8, freshness: "ACTUALIZADA" });

    const quantityChanged = await repository.update(original!.id, {
      name: original!.name, description: original!.description,
      components: original!.components.map((item, index) => ({ sku: item.sku, quantity: index === 0 ? item.quantity + 1 : item.quantity })),
      priceMinor: 12000, version: original!.version,
    });
    expect(quantityChanged).toMatchObject({ status: "ACTIVO", version: original!.version + 1, availability: { verifiable: false, quantity: null, freshness: "INCOMPLETA", calculatedAt: null } });

    const skuChanged = await repository.update(original!.id, {
      name: quantityChanged.name, description: quantityChanged.description,
      components: [{ sku: "INKA-ROPE-01", quantity: 1 }, { sku: "INKA-MAT-01", quantity: 1 }],
      priceMinor: 12000, version: quantityChanged.version,
    });
    expect(skuChanged.availability).toMatchObject({ verifiable: false, quantity: null, freshness: "INCOMPLETA" });

    const beforeRename = await repository.getById(original!.id);
    const renamed = await repository.update(original!.id, {
      name: "Nombre actualizado", description: beforeRename!.description,
      components: beforeRename!.components.map(({ sku, quantity }) => ({ sku, quantity })),
      priceMinor: beforeRename!.priceMinor, version: beforeRename!.version,
    });
    expect(renamed.availability).toEqual(beforeRename!.availability);
    expect(renamed.name).toBe("Nombre actualizado");
  });

  it("mantiene el borrador local y expone la versión conflictiva sin sustituirla", async () => {
    const repository = new MockCombosRepository();
    const original = await repository.getById("combo-entrenamiento");
    const localDraft = draftFromCombo(original ?? undefined);
    localDraft.name = "Nombre local";
    localDraft.price = "120.00";
    const conflict = await repository.update("combo-entrenamiento", { ...validPayload, version: original!.version }, "version-conflict").catch((reason: unknown) => reason);
    expect(conflict).toMatchObject({ kind: "version_conflict", currentVersion: { version: original!.version + 1, name: `${original!.name} (actualizado en servidor)` } });
    const captured = keepDraftAfterVersionConflict(localDraft, conflict instanceof ComboError ? conflict.currentVersion : undefined);
    const currentVersion = captured.currentVersion;
    expect(captured.draft).toMatchObject({ name: "Nombre local", price: "120.00" });
    expect(currentVersion).toEqual(await repository.getById("combo-entrenamiento"));
    const savedAfterExplicitDiscard = await repository.update("combo-entrenamiento", {
      name: currentVersion!.name, description: currentVersion!.description,
      components: currentVersion!.components.map(({ sku, quantity }) => ({ sku, quantity })),
      priceMinor: currentVersion!.priceMinor, version: currentVersion!.version,
    }, "version-conflict");
    expect(savedAfterExplicitDiscard.version).toBe(currentVersion!.version + 1);
    expect(savedAfterExplicitDiscard.name).toBe(currentVersion!.name);
  });

  it("devuelve exactamente la versión persistida ante una versión enviada obsoleta", async () => {
    const repository = new MockCombosRepository();
    const persisted = await repository.getById("combo-entrenamiento");
    const conflict = await repository.update("combo-entrenamiento", { ...validPayload, version: persisted!.version - 1 }).catch((reason: unknown) => reason);
    expect(conflict).toMatchObject({ kind: "version_conflict", currentVersion: persisted });
    expect(await repository.getById("combo-entrenamiento")).toEqual(persisted);
  });

  it("crea un borrador independiente al cambiar entre dos combos", () => {
    const first = draftFromCombo(comboFixtures[0]);
    const second = draftFromCombo(comboFixtures[1]);
    first.name = "Borrador de la primera entidad";
    expect(second.name).toBe("Kit yoga diario");
    expect(second.components.map((item) => item.sku)).toEqual(["INKA-MAT-01", "INKA-BLOCK-02"]);
  });
});

describe("protección frente a respuestas fuera de orden", () => {
  it("solo permite aplicar el resultado de la consulta más reciente", async () => {
    let resolveOlder!: (value: string) => void;
    let resolveNewer!: (value: string) => void;
    const older = new Promise<string>((resolve) => { resolveOlder = resolve; });
    const newer = new Promise<string>((resolve) => { resolveNewer = resolve; });
    const identity = new RequestIdentity();
    const oldId = identity.begin();
    const newId = identity.begin();
    let visible = "";
    const apply = async (request: Promise<string>, requestId: number) => {
      const value = await request;
      if (identity.isCurrent(requestId)) visible = value;
    };
    const oldWork = apply(older, oldId);
    const newWork = apply(newer, newId);
    resolveNewer("filtro vigente");
    await newWork;
    resolveOlder("filtro anterior");
    await oldWork;
    expect(visible).toBe("filtro vigente");
  });
});

describe("paginación de S01", () => {
  it("normaliza entradas vacías, inválidas, infinitas o fuera de rango a la primera página", () => {
    for (const value of [null, "", "0", "-2", "1.5", "Infinity", "9007199254740992", "abc"]) {
      expect(parseComboPage(value)).toBe(1);
    }
    expect(parseComboPage("3")).toBe(3);
  });
});
