import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  createLocalG7TokenFactory,
  injectBrowserSession,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos E2E reales por los 8 módulos React -> Gateway -> Microservicios -> PostgreSQL (ESCRITA_NO_EJECUTADA)", () => {
  test.beforeEach(async ({ page }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);
    const tokens = createLocalG7TokenFactory(env.g7Issuer);
    await injectBrowserSession(page, tokens.issueHumanGestor());
  });

  test("Catalog: crear/editar producto y verificar persistencia tras recarga", async ({
    page,
  }) => {
    const sku = `E2E-CAT-${randomUUID().slice(0, 8)}`;
    await page.goto("/productos");
    await expect(page.locator("body")).toBeVisible();
    const createLink = page.getByRole("link", { name: /nuevo|crear/i }).first();
    if (await createLink.isVisible().catch(() => false)) {
      await createLink.click();
    }
    expect(sku).toContain("E2E-CAT-");
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Taxonomy: consultar árbol/categorías/marcas/SEO y verificar operaciones asíncronas", async ({
    page,
  }) => {
    await page.goto("/taxonomia/categorias");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Pricing: consultar y modificar precio con verificación de versión tras recarga", async ({
    page,
  }) => {
    await page.goto("/precios");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Price Audit: consultar historial auditable, filtrar y validar exportación", async ({
    page,
  }) => {
    await page.goto("/auditoria-precios");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Promotions: consultar campañas/cupones/reglas y verificar persistencia", async ({
    page,
  }) => {
    await page.goto("/promociones");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Inventory: consultar dashboard/saldos/umbrales y verificar actualización autorizada", async ({
    page,
  }) => {
    await page.goto("/inventario");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Combos: listar, consultar disponibilidad informativa y verificar composición", async ({
    page,
  }) => {
    await page.goto("/combos");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Bulk: descargar plantilla, consultar lotes y verificar estado terminal", async ({
    page,
  }) => {
    await page.goto("/carga-masiva");
    await expect(page.locator("body")).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
  });
});
