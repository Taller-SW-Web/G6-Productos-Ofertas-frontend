import { test, expect } from "@playwright/test";

test.describe("P2: Independencia de mocks con AlternateInventoryRepository", () => {
  test("Lectura de stock autoritativo desde repositorio alternativo (sin mocks)", async ({
    page,
  }) => {
    await page.goto("/tests/harness/inventory-adapter.html?path=/inventario");

    await expect(
      page.getByRole("heading", { name: "Control de stock y disponibilidad" }),
    ).toBeVisible();

    // Comprobar que se cargan los items del repositorio alternativo
    await expect(page.getByText("ALT-RUN-41-BLU")).toBeVisible();
    await expect(page.getByText("ALT-POL-M-RED")).toBeVisible();
    await expect(page.getByText("ALT-GOR-U-BLK", { exact: true })).toBeVisible();

    // Comprobar que NO contiene los datos de MockInventoryAdapter/fixtures
    await expect(page.getByText("ZAP-TRL-40-BLK")).toHaveCount(0);
  });

  test("Filtros de busqueda y estado funcionan sobre el repositorio alternativo", async ({
    page,
  }) => {
    await page.goto("/tests/harness/inventory-adapter.html?path=/inventario");

    const searchInput = page.getByRole("textbox", {
      name: "Buscar SKU o producto",
    });
    await searchInput.fill("Runner");

    await expect(page.getByText("ALT-RUN-41-BLU")).toBeVisible();
    await expect(page.getByText("ALT-POL-M-RED")).not.toBeVisible();
    await expect(page.getByText("ALT-GOR-U-BLK", { exact: true })).not.toBeVisible();

    await page.getByRole("button", { name: "Limpiar" }).click();
    await expect(page.getByText("ALT-POL-M-RED")).toBeVisible();
  });

  test("Resultados vacios renderizan estado amigable", async ({ page }) => {
    await page.goto(
      "/tests/harness/inventory-adapter.html?path=/inventario&empty=1",
    );

    await expect(
      page.getByText("No se encontraron saldos de stock"),
    ).toBeVisible();
  });

  test("Manejo de errores del repositorio alternativo muestra reintento", async ({
    page,
  }) => {
    await page.goto(
      "/tests/harness/inventory-adapter.html?path=/inventario&fail-read=1",
    );

    await expect(
      page.getByRole("button", { name: "Reintentar consulta" }),
    ).toBeVisible();
  });

  test("Recepcion de traslados acredita stock y refresca vistas", async ({
    page,
  }) => {
    await page.goto(
      "/tests/harness/inventory-adapter.html?path=/inventario/traslados",
    );

    await expect(
      page.getByRole("heading", { name: "Traslados y recepciones de inventario" }),
    ).toBeVisible();

    await expect(page.getByText("TR-ALT-901")).toBeVisible();

    await page.getByRole("button", { name: "Recepcionar" }).first().click();

    const dialog = page.getByRole("dialog", { name: /Registrar recep/i });
    await expect(dialog).toBeVisible();

    const qtyInput = dialog.getByRole("textbox", {
      name: /Cantidad recibida/i,
    });
    await qtyInput.fill("20");

    await dialog
      .getByRole("button", { name: /Confirmar recep/i })
      .click();

    await expect(
      page.getByText("Operación completada"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cerrado" }),
    ).toBeVisible();
  });

  test("Dashboard analitico procesa metricas y alertas con repositorio alternativo", async ({
    page,
  }) => {
    await page.goto(
      "/tests/harness/inventory-adapter.html?path=/inventario/dashboard",
    );

    await expect(
      page.getByRole("heading", { name: "Dashboard analítico y alertas de stock" }),
    ).toBeVisible();

    // Verificar tabla analitica con datos alternativos
    await expect(page.getByRole("cell", { name: "ALT-RUN-41-BLU" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "ALT-GOR-U-BLK" })).toBeVisible();

    // Verificar alertas generadas dinamicamente
    await expect(
      page.getByRole("heading", { name: "Alertas operativas de inventario" }),
    ).toBeVisible();
    await expect(page.getByText("Quiebre de stock: ALT-GOR-U-BLK")).toBeVisible();
  });
});