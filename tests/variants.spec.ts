import { expect, test, type Page } from "@playwright/test";

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test.describe("MK-004 Gestión avanzada de variantes (SKU)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("S01: Listado de variantes por producto padre, filtros y alerta para producto simple (CA-01)", async ({
    page,
  }) => {
    // 1. Visit variant list for product with variants (PROD-OXF-001)
    await page.goto("/productos/PROD-OXF-001/variantes");
    await expect(
      page.getByRole("heading", { name: "Variantes de Camisa Oxford Manga Larga" }),
    ).toBeVisible();

    // Verify context card shows parent info and base price
    await expect(page.getByText("SKU Base: CAM-OXF")).toBeVisible();
    await expect(page.getByText(/Precio Base: S\/\.\s*129\.90/)).toBeVisible();

    // Verify initial variant items
    await expect(page.getByRole("link", { name: "CAM-OXF-BLA-M" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CAM-OXF-AZU-L" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CAM-OXF-NEG-S" })).toBeVisible();

    // Filter by status "Solo Activas"
    const statusSelect = page.getByRole("combobox", { name: "Filtrar por estado" });
    await statusSelect.click();
    await page.getByRole("option", { name: "Solo Activas" }).click();

    await expect(page.getByRole("link", { name: "CAM-OXF-BLA-M" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CAM-OXF-NEG-S" })).toHaveCount(0);

    // Capture visual evidence S01
    await page.screenshot({ path: "docs/evidencias/mk004-s01-variantes-1440.png" });
    await noPageOverflow(page);

    // 2. Verify simple product compatibility check (CA-01)
    await page.goto("/productos/PROD-CAS-001/variantes");
    await expect(
      page.getByText("Incompatible: Producto Simple"),
    ).toBeVisible();
    await expect(
      page.getByText("Los productos simples gestionan su inventario y perfil físico directamente"),
    ).toBeVisible();
    await noPageOverflow(page);
  });

  test("S02: Crear nueva variante en BORRADOR y navegación inmediata a S04 (CA-02, CA-03, CA-04)", async ({
    page,
  }) => {
    await page.goto("/productos/PROD-OXF-001/variantes/nueva");
    await expect(
      page.getByRole("heading", { name: "Nueva Variante (SKU)" }),
    ).toBeVisible();

    // Fill optional SKU (or let catalog generate it)
    const customSku = `CAM-OXF-ROJ-S-${Date.now().toString().slice(-4)}`;
    await page.getByPlaceholder("Ej. PROD-OXF-AZUL-M (Opcional)").fill(customSku);

    // Fill identifying attributes
    await page.getByPlaceholder("Valor (ej. M, Azul Marino)").fill("Rojo Carmesí");

    // Fill physical dimensions in kg / cm
    await page.getByRole("textbox", { name: "Peso (kg)" }).fill("0.30");
    await page.getByRole("textbox", { name: "Largo (cm)" }).fill("35");
    await page.getByRole("textbox", { name: "Ancho (cm)" }).fill("25");
    await page.getByRole("textbox", { name: "Alto (cm)" }).fill("3");

    // Capture visual evidence S02 Alta
    await page.screenshot({ path: "docs/evidencias/mk004-s02-crear-1440.png" });
    await noPageOverflow(page);

    // Submit form: should create in BORRADOR and immediately navigate to S04 (Preparación)
    await page.getByRole("button", { name: "Guardar Variante" }).first().click();

    // Verify immediate redirect to preparation view S04
    await expect(page).toHaveURL(new RegExp(`/productos/PROD-OXF-001/variantes/.+/preparacion`));
    await expect(
      page.getByRole("heading", { name: new RegExp(`Preparación de Inventario: ${customSku}`) }),
    ).toBeVisible();
    await noPageOverflow(page);
  });

  test("S03: Ficha de detalle de variante, herencia de precio e inmutabilidad (CA-05, CA-07, CA-11)", async ({
    page,
  }) => {
    await page.goto("/productos/PROD-OXF-001/variantes/VAR-OXF-BLA-M");
    await expect(
      page.getByRole("heading", { name: "Variante: CAM-OXF-BLA-M" }),
    ).toBeVisible();

    // Verify identifying attributes
    await expect(page.getByText("Color principal: Blanco")).toBeVisible();
    await expect(page.getByText("Talla: M")).toBeVisible();

    // Verify physical profile
    await expect(page.getByText("0.28 kg")).toBeVisible();
    await expect(page.getByText("35 cm")).toBeVisible();

    // Verify price inheritance alert
    await expect(page.getByText("Precio Base Heredado")).toBeVisible();
    await expect(page.getByText(/Precio del producto padre:/)).toBeVisible();
    await expect(page.getByText(/129\.90/)).toBeVisible();

    // Capture visual evidence S03 Detalle
    await page.screenshot({ path: "docs/evidencias/mk004-s03-detalle-1440.png" });
    await noPageOverflow(page);
  });

  test("S02 Edición: SKU y atributos identificadores son inmutables (CA-11)", async ({
    page,
  }) => {
    await page.goto("/productos/PROD-OXF-001/variantes/VAR-OXF-BLA-M/editar");
    await expect(
      page.getByRole("heading", { name: "Editar Variante: CAM-OXF-BLA-M" }),
    ).toBeVisible();

    // Verify SKU input is disabled
    const skuInput = page.getByRole("textbox", { name: "SKU de la Variante" });
    await expect(skuInput).toBeDisabled();

    // Verify identifying attributes are rendered as immutable badges (no edit inputs)
    await expect(page.getByText("Color principal: Blanco")).toBeVisible();
    await expect(page.getByText("Talla: M")).toBeVisible();

    // Edit non-identifying attributes and weight
    await page.getByRole("textbox", { name: "Peso (kg)" }).fill("0.29");

    // Capture visual evidence S02 Edición
    await page.screenshot({ path: "docs/evidencias/mk004-s02-editar-1440.png" });
    await noPageOverflow(page);

    // Save changes and verify return to S03
    await page.getByRole("button", { name: "Guardar Cambios" }).first().click();
    await expect(page).toHaveURL(/\/productos\/PROD-OXF-001\/variantes\/VAR-OXF-BLA-M$/);
    await expect(page.getByText("0.29 kg")).toBeVisible();
  });

  test("S04: Preparación de Inventario y reintento atómico (CA-19, CA-21)", async ({
    page,
  }) => {
    await page.goto("/productos/PROD-OXF-001/variantes/VAR-OXF-BLA-M/preparacion");
    await expect(
      page.getByRole("heading", { name: "Preparación de Inventario: CAM-OXF-BLA-M" }),
    ).toBeVisible();

    // Check completed state
    await expect(page.getByText("Preparación Completada (COMPLETED)")).toBeVisible();
    await expect(page.getByText("El SKU se encuentra registrado y validado")).toBeVisible();

    // Capture visual evidence S04
    await page.screenshot({ path: "docs/evidencias/mk004-s04-preparacion-1440.png" });
    await noPageOverflow(page);
  });

  test("S05: Desactivación de variante y regla de impacto en producto padre (CA-12, FLOW-004 §4.4)", async ({
    page,
  }) => {
    // Navigate to variant detail of an active variant
    await page.goto("/productos/PROD-OXF-001/variantes/VAR-OXF-AZU-L");
    await expect(
      page.getByRole("button", { name: "Desactivar" }),
    ).toBeVisible();

    // Open deactivation dialog
    await page.getByRole("button", { name: "Desactivar" }).click();
    await expect(
      page.getByRole("heading", { name: "Desactivar Variante (SKU)" }),
    ).toBeVisible();

    // Capture visual evidence S05 Desactivar
    await page.screenshot({ path: "docs/evidencias/mk004-s05-desactivar-1440.png" });
    await noPageOverflow(page);

    // Confirm deactivation
    await page.getByRole("button", { name: "Desactivar Variante" }).click();

    // Verify variant is now INACTIVA
    await expect(page.getByText("INACTIVA").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();
  });

  test("S06: Reactivación de variante inactiva con independencia del padre (CA-14)", async ({
    page,
  }) => {
    // Navigate to variant detail of an inactive variant
    await page.goto("/productos/PROD-OXF-001/variantes/VAR-OXF-NEG-S");
    await expect(
      page.getByRole("button", { name: "Reactivar" }),
    ).toBeVisible();

    // Open reactivation dialog
    await page.getByRole("button", { name: "Reactivar" }).click();
    await expect(
      page.getByRole("heading", { name: "Reactivar Variante (SKU)" }),
    ).toBeVisible();

    // Verify checklist and parent independence note
    await expect(page.getByText("Independencia del Padre:")).toBeVisible();
    await expect(page.getByText("Reactivar esta variante no reactiva automáticamente al producto padre")).toBeVisible();

    // Capture visual evidence S06 Reactivar
    await page.screenshot({ path: "docs/evidencias/mk004-s06-reactivar-1440.png" });
    await noPageOverflow(page);

    // Confirm reactivation
    await page.getByRole("button", { name: "Reactivar Variante" }).click();

    // Verify variant is now ACTIVA
    await expect(page.getByText("ACTIVA").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Desactivar" })).toBeVisible();
  });
});
