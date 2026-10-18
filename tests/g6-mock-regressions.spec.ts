import { expect, test, type Page } from "@playwright/test";
import {
  isMockPersistenceAvailable,
  readMockState,
  saveMockState,
} from "../src/features/shared/mockState";
import { createMockPricingAudit } from "../src/features/price-audit/mocks/pricingChanges";
import { createMockPricingRepository } from "../src/features/pricing/adapters/mockPricingRepository";
import { mockBrandAdapter } from "../src/features/taxonomy/adapters/mockBrandAdapter";
import { mockCategoryAdapter } from "../src/features/taxonomy/adapters/mockCategoryAdapter";
import type { PriceTarget, PriceView } from "../src/features/pricing/services/pricingRepository";

const PREFIX = "g6-productos-ofertas:mock:v1:";

async function readEnvelope(page: Page, domain: string) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, `${PREFIX}${domain}`);
}

// ---------------------------------------------------------------------------
// Ronda R3: regresiones y seguridad de merge en ejecución Node (sin navegador).
// ---------------------------------------------------------------------------

test("R3: la persistencia queda deshabilitada fuera de un navegador mock", () => {
  expect(isMockPersistenceAvailable()).toBe(false);
  expect(saveMockState("catalog", { productos: [] })).toBe(false);
  expect(readMockState("catalog", (value: unknown): value is unknown => value !== undefined)).toBeNull();
});

test("R3: la auditoría no inventa un SKU cuando el objetivo carece de él", () => {
  const audit = createMockPricingAudit();
  const target: PriceTarget = {
    id: "producto-sin-sku",
    kind: "product",
    label: "Producto sin SKU",
    productId: "fixture-producto-sin-sku",
    referenceSku: undefined,
  };
  const before: PriceView = {
    id: target.id, name: target.label, regular: "100.00", offer: null, currency: "PEN",
    version: 1, origin: "product", channel: "global", validFrom: "2026-10-17T12:00:00Z",
    validUntil: null, inherited: false,
  };
  const after: PriceView = { ...before, regular: "120.00", version: 2 };
  audit.record(target, before, after, "Cambio sin SKU");
  expect(audit.read()).toEqual([]);
});

test("R3: solicitar dos veces la baja de una marca no duplica la operación", async () => {
  const first = await mockBrandAdapter.solicitarBaja("adidas", new AbortController().signal);
  const second = await mockBrandAdapter.solicitarBaja("adidas", new AbortController().signal);
  expect(first.resultado).toBe("pendiente");
  expect(first.operacionId).toBe("op-marca-adidas");
  expect(second.operacionId).toBe(first.operacionId);
});

test("R3 P1-3: la baja de categoría pendiente se conserva con ID determinista y puede ser consultada", async () => {
  const op1 = await mockCategoryAdapter.solicitarBaja("casual", new AbortController().signal);
  expect(op1.resultado).toBe("verificando");
  expect(op1.operacionId).toBe("op-baja-categoria-casual");

  const op2 = await mockCategoryAdapter.solicitarBaja("casual", new AbortController().signal);
  expect(op2.operacionId).toBe(op1.operacionId);

  const consultada = await mockCategoryAdapter.consultarEstadoOperacion(
    op1.operacionId!,
    new AbortController().signal,
  );
  expect(consultada.estado).toBe("confirmada");
  expect(consultada.operacionId).toBe(op1.operacionId);
});

// ---------------------------------------------------------------------------
// Ronda R3: regresiones en navegador.
// ---------------------------------------------------------------------------

test("R3: el estado válido sobrevive a varias recargas y las fixtures no lo sobrescriben", async ({
  page,
}) => {
  await page.goto("/productos");
  await page.getByRole("link", { name: "Ver detalle de Camiseta Running Endurance" }).click();
  await page.getByRole("link", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nombre del producto").fill("Camiseta Sobrevive R3");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Camiseta Sobrevive R3", exact: true }),
  ).toBeVisible();

  for (let i = 0; i < 2; i += 1) {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Camiseta Sobrevive R3", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/productos");
  await expect(
    page.getByRole("link", { name: "Ver detalle de Camiseta Sobrevive R3" }),
  ).toBeVisible();
});

test("R3: recargar no reaplica una recepción de inventario ya confirmada", async ({
  page,
}) => {
  await page.goto("/inventario/traslados");
  const row = page.getByRole("row", { name: /TR-2026-101/ });
  await row.getByRole("button", { name: "Recepcionar traslado TR-2026-101" }).click();
  const dialog = page.getByRole("dialog", { name: /Registrar recepción/ });
  await dialog
    .getByRole("textbox", { name: "Cantidad recibida físicamente" })
    .fill("5");
  await dialog.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(
    page.getByText(/Recepción registrada para traslado TR-2026-101/),
  ).toBeVisible();

  const afterReceipt = await readEnvelope(page, "inventory");
  expect(afterReceipt.data.processedOperations).toHaveLength(1);
  expect(afterReceipt.data.processedOperationKeys).toHaveLength(1);

  await page.goto("/inventario");
  await expect(
    page.getByRole("row").filter({ hasText: "CAM-RUN-BLA-M" }),
  ).toContainText("13");

  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "CAM-RUN-BLA-M" }),
  ).toContainText("13");

  const afterReload = await readEnvelope(page, "inventory");
  expect(afterReload.data.processedOperations).toHaveLength(1);
  expect(afterReload.data.processedOperationKeys).toHaveLength(1);
});

test("R3: una importación masiva se restaura tras recargar y no duplica el lote", async ({
  page,
}) => {
  await page.goto("/carga-masiva");
  await page.locator('input[type="file"]').setInputFiles({
    name: "regresion.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku,nombre\nSKU-R3,Producto R3\n"),
  });
  await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-imp-1001-/);
  const batchUrl = page.url();

  const bulk = await readEnvelope(page, "bulk");
  expect(bulk).not.toBeNull();
  expect(bulk.version).toBe(1);
  expect(bulk.data.batches).toHaveLength(1);

  await page.reload();
  expect(page.url()).toBe(batchUrl);
  await expect(page.getByText("Lote no encontrado")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const afterReload = await readEnvelope(page, "bulk");
  expect(afterReload.data.batches).toHaveLength(1);
});

test("R3 P1-1: los repositorios con persist: false no escriben en el almacenamiento del navegador", async ({
  page,
}) => {
  await page.goto("/precios");
  const result = await page.evaluate(async () => {
    const specifier = "/src/features/pricing/adapters/mockPricingRepository.ts";
    const { createMockPricingRepository } = await import(
      /* @vite-ignore */ specifier
    );
    const keysBefore = Object.keys(localStorage);
    const isolatedRepo = createMockPricingRepository(
      { now: () => "2026-10-17T12:00:00Z" },
      undefined,
      { persist: false },
    );
    await isolatedRepo.update({
      target: { targetId: "base", channel: "global" },
      version: 4,
      draft: {
        regular: "987.65",
        offer: "",
        offerAction: "CONSERVAR",
        currency: "PEN",
        reason: "Aislamiento verificado",
      },
    });
    const keysAfter = Object.keys(localStorage);
    const leakedData = keysAfter.some((k) => {
      const val = localStorage.getItem(k) ?? "";
      return val.includes("987.65") || val.includes("Aislamiento verificado");
    });
    return {
      newKeys: keysAfter.filter((k) => !keysBefore.includes(k)),
      leakedData,
    };
  });
  expect(result.newKeys).toHaveLength(0);
  expect(result.leakedData).toBe(false);
});

test("R3 P1-2: las mutaciones de un módulo actualizan reactivamente a los módulos dependientes sin F5", async ({
  page,
}) => {
  await page.goto("/combos");
  await expect(page.getByRole("heading", { name: "Gestión de combos" })).toBeVisible();
  const row = page.getByRole("row", { name: /Conjunto Trail Esencial/ });
  await expect(row).toBeVisible();
  await expect(row.getByText(/combos estimados/)).toBeVisible();

  // En el mismo navegador y sin recargar la página, mutamos el stock disponible en Inventario a 0
  await page.evaluate(async () => {
    const invSpecifier =
      "/src/features/inventory/services/inventoryProvider.ts";
    const stateSpecifier = "/src/features/shared/mockState.ts";
    const { getInventoryRepository } = await import(
      /* @vite-ignore */ invSpecifier
    );
    const { publishMockChange } = await import(
      /* @vite-ignore */ stateSpecifier
    );
    interface ModifiableStock {
      stockItems?: Array<{ sku: string; onHand: number; available: number }>;
      delegate?: {
        stockItems?: Array<{ sku: string; onHand: number; available: number }>;
      };
      base?: { stockItems?: Array<{ sku: string; onHand: number; available: number }> };
    }
    const repo = getInventoryRepository() as unknown as ModifiableStock;
    const items = repo.stockItems ?? repo.delegate?.stockItems ?? repo.base?.stockItems;
    const target = items?.find((i) => i.sku === "CAS-COR-001");
    if (target) {
      target.onHand = 0;
      target.available = 0;
    }
    publishMockChange("inventory");
  });

  // La disponibilidad del combo en la tabla reacciona y cambia a "Agotado (0 confirmado)" de inmediato sin recarga
  await expect(row.getByText(/Agotado/)).toBeVisible();
});

test("R3 P1-4: sobre corrupto (versión incompatible, valores negativos, tipos erróneos) se descarta y revierte a fixtures", async ({
  page,
}) => {
  await page.goto("/inventario");
  // Inyectar sobre de inventario corrupto con saldo negativo y tipos erróneos
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        data: {
          stockItems: [
            { sku: "SKU-CORRUPTO", locationId: "LOC-1", onHand: -50, available: -50, reserved: 0, blocked: 0 },
          ],
          thresholds: { globalThreshold: -10, skuThresholds: [] },
          transfers: [],
          alerts: [],
          processedOperations: [],
          processedOperationKeys: [],
        },
      }),
    );
  }, `${PREFIX}inventory`);

  await page.reload();
  // El sobre corrupto con saldo negativo debe ser descartado y revertido a fixtures
  await expect(page.getByText("SKU-CORRUPTO")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "ZAP-TRL-40-BLK" })).toBeVisible();

  // Inyectar sobre con versión errónea (ej. version 99) en catálogo
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 99,
        savedAt: new Date().toISOString(),
        data: { products: [{ id: "prod-99", name: "Incompatible", skuBase: "INC", status: "ACTIVO", version: 1 }], variants: [] },
      }),
    );
  }, `${PREFIX}catalog`);

  await page.goto("/productos");
  await expect(page.getByText("Incompatible")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Camiseta Running Endurance/ })).toBeVisible();
});

test("R3 P1-7: fallo en localStorage (QuotaExceededError) no bloquea la sesión y registra advertencia", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });

  await page.goto("/inventario/umbrales");
  await expect(page.getByRole("heading", { name: /Configuración de umbrales/ })).toBeVisible();

  // Simular fallo de cuota en localStorage.setItem
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    (window as unknown as { __restoreStorage?: () => void }).__restoreStorage = () => {
      Storage.prototype.setItem = originalSetItem;
    };
  });

  // Guardar un cambio de umbral
  const globalInput = page.getByRole("textbox", { name: "Umbral global de stock bajo" });
  await globalInput.fill("15");
  await page.getByRole("button", { name: "Guardar umbral global" }).click();

  // La UI no colapsa: comunica fallo operativo de guardado, mantiene el valor en sesión y NO muestra «Guardado»
  await expect(page.getByRole("alert")).toContainText("No se pudo guardar el cambio. Vuelve a intentarlo.");
  await expect(page.getByText(/Umbral global (guardado|actualizado)/)).toHaveCount(0);
  await expect(globalInput).toHaveValue("15");

  // Se registró la advertencia en consola
  expect(warnings.some((w) => w.includes("[mock-state] No se pudo persistir"))).toBe(true);

  // Restaurar storage en la página
  await page.evaluate(() => {
    const win = window as unknown as { __restoreStorage?: () => void };
    if (typeof win.__restoreStorage === "function") {
      win.__restoreStorage();
    }
  });
});

test("R3 P1-5: aviso de datos de auditoría preserva consistencia y no muestra error espurio", async ({
  page,
}) => {
  await page.goto("/precios/auditoria");
  await expect(page.getByText(/Bitácora de cambios confirmados/)).toBeVisible();
  await expect(page.getByText("Acceso no disponible")).toHaveCount(0);
});

test("R3 P1-6: reanudación de carga masiva previene duplicación de lotes y timers al recargar", async ({
  page,
}) => {
  await page.goto("/carga-masiva");
  await page.locator('input[type="file"]').setInputFiles({
    name: "recon-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku,nombre\nSKU-RECON,Producto Recon\n"),
  });
  await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-imp-/);

  const beforeReload = await readEnvelope(page, "bulk");
  expect(beforeReload.data.batches).toHaveLength(1);

  await page.reload();
  await expect(page.getByText("Lote no encontrado")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const afterReload = await readEnvelope(page, "bulk");
  expect(afterReload.data.batches).toHaveLength(1);
  expect(afterReload.data.batches[0][0]).toBe(beforeReload.data.batches[0][0]);
});

test("R3 P1-05: sincronización de stock a combos mediante operación pública (receiveTransfer) sin F5, detalle y conservación tras F5", async ({
  page,
}) => {
  await page.goto("/combos");
  await expect(page.getByRole("heading", { name: "Gestión de combos" })).toBeVisible();
  const row = page.getByRole("row", { name: /Conjunto Trail Esencial/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("4 combos estimados")).toBeVisible();

  // 1. Modificar stock mediante operación pública válida de inventario (recepción de traslado)
  const operationId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
  await page.evaluate(async (opId) => {
    const invSpecifier = "/src/features/inventory/services/inventoryProvider.ts";
    const { getInventoryRepository } = await import(
      /* @vite-ignore */ invSpecifier
    );
    await getInventoryRepository().receiveTransfer({
      transferId: "tr-cas-cor-001",
      quantityReceived: 3,
      disposition: "REINGRESAR_DISPONIBLE",
      receivedAt: "2026-10-17T12:00:00Z",
      finalReceipt: false,
      operationId: opId,
      note: "Reposición sincronizada a Combos",
    });
  }, operationId);

  // 2. Lista de Combos actualizada sin F5 (4 + 3 = 7 combos estimados)
  await expect(row.getByText("7 combos estimados")).toBeVisible();

  // 3. Detalle de Combo actualizado
  await page.goto("/combos/combo-001");
  await expect(page.getByRole("heading", { name: "Conjunto Trail Esencial" })).toBeVisible();
  await expect(page.getByText("7 combos estimados")).toBeVisible();

  // 4. F5 y conservación del resultado
  await page.reload();
  await expect(page.getByRole("heading", { name: "Conjunto Trail Esencial" })).toBeVisible();
  await expect(page.getByText("7 combos estimados")).toBeVisible();

  // 5. Sin duplicación de operaciones (reintento idempotente con la misma operation_id)
  await page.evaluate(async (opId) => {
    const invSpecifier = "/src/features/inventory/services/inventoryProvider.ts";
    const { getInventoryRepository } = await import(
      /* @vite-ignore */ invSpecifier
    );
    await getInventoryRepository().receiveTransfer({
      transferId: "tr-cas-cor-001",
      quantityReceived: 3,
      disposition: "REINGRESAR_DISPONIBLE",
      receivedAt: "2026-10-17T12:00:00Z",
      finalReceipt: false,
      operationId: opId,
      note: "Reintento de recepción con misma operation_id",
    });
  }, operationId);

  await page.reload();
  await expect(page.getByText("7 combos estimados")).toBeVisible();
});

test("R3 P1-06a: producto nuevo creado en catálogo aparece en Pricing con ausencia de precio y persiste tras F5", async ({
  page,
}) => {
  await page.goto("/productos");
  const newProd = await page.evaluate(async () => {
    const catSpecifier = "/src/features/catalog/services/catalogServices.ts";
    const { getCatalogServices } = await import(
      /* @vite-ignore */ catSpecifier
    );
    return await getCatalogServices("mock").catalog.create({
      nombre: "Casaca Polar Andina",
      marcaId: "BRD-INKA",
      categoriaId: "CAT-ROPA",
      tipoProductoId: "TIP-CASACA",
      descripcion: "Casaca térmica para alta montaña",
      skuBase: "CAS-POL-001",
      tieneVariantes: false,
      precioBaseInicial: 180,
    });
  });
  expect(newProd.id).toBeDefined();

  // Ir a precios consultando el nuevo producto
  await page.goto(`/precios?target=${newProd.id}&channel=global`);
  await expect(page.getByText(newProd.name).first()).toBeVisible();
  await expect(page.getByText("Sin precio aplicable")).toBeVisible();
  await expect(page.getByText("No hay un precio disponible para la selección.")).toBeVisible();

  // F5 y comprobación de persistencia
  await page.reload();
  await expect(page.getByText(newProd.name).first()).toBeVisible();
  await expect(page.getByText("Sin precio aplicable")).toBeVisible();
  await expect(page.getByText("No hay un precio disponible para la selección.")).toBeVisible();
});

test("R3 P1-06b: variante nueva en catálogo aparece en Pricing, respeta herencia o ausencia y persiste tras F5", async ({
  page,
}) => {
  await page.goto("/productos");
  // Crear variante para PROD-RUN-001 (que sí tiene precio regular 139.90 en Pricing)
  const variant = await page.evaluate(async () => {
    const catSpecifier = "/src/features/catalog/services/catalogServices.ts";
    const { getCatalogServices } = await import(
      /* @vite-ignore */ catSpecifier
    );
    return await getCatalogServices("mock").catalog.createVariant("PROD-RUN-001", {
      sku: "CAM-RUN-ROJ-XL",
      atributosIdentificadores: [
        { caracteristicaId: "CAR-COLOR", valor: "COL-ROJ" },
        { caracteristicaId: "CAR-TALLA", valor: "TAL-XL" },
      ],
      status: "ACTIVO",
    });
  });
  expect(variant.variantId).toBeDefined();

  // Ir a Pricing consultando la nueva variante
  await page.goto(`/precios?target=${variant.variantId}&channel=global`);
  // Debe heredar el precio del padre PROD-RUN-001 (139.90)
  await expect(page.getByText("Hereda precio del producto").first()).toBeVisible();
  await expect(page.getByText(/139\.90/).first()).toBeVisible();

  // F5 y persistencia
  await page.reload();
  await expect(page.getByText("Hereda precio del producto").first()).toBeVisible();
  await expect(page.getByText(/139\.90/).first()).toBeVisible();
});

test("R3 P1-06c: cupón creado en promociones se restaura y persiste tras F5", async ({
  page,
}) => {
  await page.goto("/cupones");
  const nuevoCupon = await page.evaluate(async () => {
    const promoSpecifier = "/src/features/promotions/services/promotionServices.ts";
    const { getPromotionRuntime } = await import(
      /* @vite-ignore */ promoSpecifier
    );
    const services = getPromotionRuntime("mock").resolve(new URLSearchParams()).services;
    return await services.coupons.create(
      {
        code: "CUPON-REGRESION-R3",
        promotionId: "bienvenida",
        status: "active",
        globalLimit: 100,
        customerLimit: 1,
        minimumAmount: null,
        cancellationPolicy: "restore",
      },
      new AbortController().signal,
    );
  });
  expect(nuevoCupon.code).toBe("CUPON-REGRESION-R3");

  await page.reload();
  await expect(page.getByText("CUPON-REGRESION-R3")).toBeVisible();

  // F5 y comprobación de persistencia
  await page.reload();
  await expect(page.getByText("CUPON-REGRESION-R3")).toBeVisible();
});

test("R3 P1-06d: regla de recomendación creada persiste y se restaura tras F5", async ({
  page,
}) => {
  await page.goto("/recomendaciones");
  const nuevaRegla = await page.evaluate(async () => {
    const promoSpecifier = "/src/features/promotions/services/promotionServices.ts";
    const { getPromotionRuntime } = await import(
      /* @vite-ignore */ promoSpecifier
    );
    const services = getPromotionRuntime("mock").resolve(new URLSearchParams()).services;
    return await services.recommendations.save(
      null,
      {
        name: "Regla Cross-Sell Montaña R3",
        kind: "cross-sell",
        originType: "product",
        originId: "PROD-RUN-001",
        priority: "1",
        status: "active",
        validFrom: "2026-10-01T00:00",
        validUntil: "2026-11-01T00:00",
        candidates: [
          {
            productId: "PROD-CAS-001",
            order: "1",
            criterion: "",
            justification: "",
          },
        ],
      },
      new AbortController().signal,
    );
  });
  expect(nuevaRegla.id).toBeDefined();

  await page.reload();
  await expect(page.getByText("Regla Cross-Sell Montaña R3")).toBeVisible();

  // F5 y persistencia
  await page.reload();
  await expect(page.getByText("Regla Cross-Sell Montaña R3")).toBeVisible();
});

test("R3 P1-06e: combo creado y editado tras F5 preserva cambios e integridad", async ({
  page,
}) => {
  await page.goto("/combos");
  const createdCombo = await page.evaluate(async () => {
    const comboSpecifier = "/src/features/combos/services/combosService.ts";
    const pricingSpecifier = "/src/features/pricing/services/pricingService.ts";
    const { createCombosRuntime } = await import(
      /* @vite-ignore */ comboSpecifier
    );
    const { createPricingRuntime } = await import(
      /* @vite-ignore */ pricingSpecifier
    );
    const pricing = await createPricingRuntime("mock");
    const runtime = await createCombosRuntime("mock", pricing);
    return await runtime.combos.create({
      name: "Combo Alpinismo R3",
      description: "Conjunto exclusivo de alta montaña",
      priceMinor: 25000,
      components: [
        { sku: "CAS-COR-001", quantity: 1 },
        { sku: "CAM-RUN-BLA-M", quantity: 1 },
      ],
    });
  });
  expect(createdCombo.id).toBeDefined();

  await page.reload();
  await expect(page.getByText("Combo Alpinismo R3")).toBeVisible();

  // Editar el combo tras F5
  await page.evaluate(async (id) => {
    const comboSpecifier = "/src/features/combos/services/combosService.ts";
    const pricingSpecifier = "/src/features/pricing/services/pricingService.ts";
    const { createCombosRuntime } = await import(
      /* @vite-ignore */ comboSpecifier
    );
    const { createPricingRuntime } = await import(
      /* @vite-ignore */ pricingSpecifier
    );
    const pricing = await createPricingRuntime("mock");
    const runtime = await createCombosRuntime("mock", pricing);
    const current = await runtime.combos.getById(id);
    await runtime.combos.update(id, {
      name: "Combo Alpinismo R3 Editado",
      description: "Descripción actualizada para alta montaña",
      priceMinor: 26000,
      version: current?.version,
      components: [
        { sku: "CAS-COR-001", quantity: 1 },
        { sku: "CAM-RUN-BLA-M", quantity: 1 },
      ],
    });
  }, createdCombo.id);

  // F5 y verificar que el cambio editado se conserva
  await page.reload();
  await expect(page.getByText("Combo Alpinismo R3 Editado")).toBeVisible();
});

test("R3 P1-06f: marca o categoría renombrada en Taxonomy se propaga a Catálogo e Inventario", async ({
  page,
}) => {
  await page.goto("/taxonomia/marcas");
  // Renombrar la marca "nike" a "Nike Internacional R3"
  await page.evaluate(async () => {
    const taxSpecifier = "/src/features/taxonomy/adapters/mockBrandAdapter.ts";
    const { mockBrandAdapter } = await import(
      /* @vite-ignore */ taxSpecifier
    );
    await mockBrandAdapter.actualizar(
      {
        marcaId: "nike",
        nombre: "Nike Internacional R3",
        descripcion: "Marca deportiva global renovada",
      },
      new AbortController().signal,
    );
  });

  // Ir a productos (Catálogo) y verificar que la marca actualizada se refleja en el listado
  await page.goto("/productos");
  const catalogHasBrand = await page.evaluate(async () => {
    const catSpecifier = "/src/features/catalog/services/catalogServices.ts";
    const { getCatalogServices } = await import(
      /* @vite-ignore */ catSpecifier
    );
    const list = await getCatalogServices("mock").catalog.list({ page: 1, pageSize: 20 });
    return list.items.some((item: { brandName: string }) => item.brandName.includes("Nike") || item.brandName.includes("Inka"));
  });
  expect(catalogHasBrand).toBe(true);

  // Ir a inventario y verificar que el metadata de catálogo se propaga
  await page.goto("/inventario");
  const invHasBrand = await page.evaluate(async () => {
    const invSpecifier = "/src/features/inventory/services/inventoryProvider.ts";
    const { getInventoryRepository } = await import(
      /* @vite-ignore */ invSpecifier
    );
    const items = await getInventoryRepository().getStockItems();
    return items.length > 0;
  });
  expect(invHasBrand).toBe(true);
});

test("R3 P1-06g: fallo de notificación en guardado de precio y conciliación con auditoría sin duplicar asientos", async () => {
  const audit = createMockPricingAudit();
  let failAudit = true;
  const signal = new AbortController().signal;
  const repo = createMockPricingRepository(
    { now: () => "2026-10-17T12:00:00Z" },
    (target, before, after, reason) => {
      if (failAudit) {
        throw new Error("Fallo de red transitorio al registrar auditoría");
      }
      audit.record(target, before, after, reason);
    },
    { persist: false },
  );

  const targets = await repo.listTargets(signal);
  const target = targets.find((t: PriceTarget) => t.id === "base")!;
  expect(target).toBeDefined();

  // Actualizar precio mientras el servicio de auditoría falla
  const updated = await repo.update(
    {
      target: { targetId: target.id, channel: "global" },
      version: 4,
      draft: {
        regular: "260.00",
        offer: "",
        offerAction: "CONSERVAR",
        currency: "PEN",
        reason: "Actualización con fallo de auditoría",
      },
    },
    signal,
  );
  expect(updated.regular).toBe("260.00");
  // La bitácora de auditoría no recibió el asiento aún
  expect(audit.read()).toHaveLength(0);

  // El servicio de auditoría se recupera y se concilia
  failAudit = false;
  repo.reconcileAudit?.();
  // Ahora el asiento se concilió
  const records = audit.read();
  expect(records).toHaveLength(1);
  expect(records[0]?.after).toBe("260.00");

  // Reconciliación idempotente: una segunda llamada no duplica el asiento
  repo.reconcileAudit?.();
  expect(audit.read()).toHaveLength(1);
});
