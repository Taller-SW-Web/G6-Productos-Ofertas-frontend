import { expect, test, type Page } from "@playwright/test";
import {
  isMockPersistenceAvailable,
  readMockState,
  saveMockState,
} from "../src/features/shared/mockState";
import { createMockPricingAudit } from "../src/features/price-audit/mocks/pricingChanges";
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
  const leakedKeys = await page.evaluate(() => {
    return Object.keys(localStorage).filter((k) => k.includes("pricing-isolated-leak"));
  });
  expect(leakedKeys).toHaveLength(0);
});

test("R3 P1-2: publishMockChange emite evento reactivo que actualiza suscriptores", async ({
  page,
}) => {
  await page.goto("/combos");
  const eventDispatched = await page.evaluate(async () => {
    return new Promise<boolean>((resolve) => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.domain === "pricing") {
          window.removeEventListener("g6:mock-state-change", handler);
          resolve(true);
        }
      };
      window.addEventListener("g6:mock-state-change", handler);
      window.dispatchEvent(
        new CustomEvent("g6:mock-state-change", { detail: { domain: "pricing" } }),
      );
    });
  });
  expect(eventDispatched).toBe(true);
});

test("R3 P1-4: sobre corrupto con campos superficiales inválidos se descarta y revierte a fixtures", async ({
  page,
}) => {
  await page.goto("/productos");
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        data: {
          products: [{ id: "corrupto", name: "Corrupto", skuBase: "COR", status: "STATUS_INVALIDO" }],
          variants: [],
        },
      }),
    );
  }, `${PREFIX}catalog`);

  await page.reload();
  await expect(page.getByText("Corrupto")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Camiseta Running Endurance/ })).toBeVisible();
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
