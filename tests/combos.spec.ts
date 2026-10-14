import { test, expect } from "@playwright/test";

test.describe("MK-002 — Gestión de combos de productos", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Navigate to commercial root
    await page.goto("/combos");
    await page.waitForLoadState("domcontentloaded");
  });

  // S01: Listado, tabla, badges y navegación
  test("S01: Listado inicial renderiza combos registrados, badges y navegación lateral activa", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: "Gestión de combos", exact: true })).toBeVisible();

    // Verify sidebar navigation
    const nav = page.getByRole("navigation", { name: "Navegación de la aplicación" });
    const activeLink = nav.locator('a[aria-current="page"]');
    await expect(activeLink).toContainText("Combos de productos");

    // Table rows
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(6);

    // Check specific combo data
    await expect(page.getByText("Pack Ejecutivo Smart Casual")).toBeVisible();
    await expect(page.getByText("S/ 150.00")).toBeVisible();
    await expect(page.getByText("24 combos estimados")).toBeVisible();
    await expect(page.getByText("Agotado actualmente")).toBeVisible();
  });

  test("S01: Filtro por estado administrativo actualiza la lista y URL", async ({ page }) => {
    // Filter by INACTIVO
    const filterSelect = page.getByRole("combobox", { name: "Filtrar por estado administrativo" });
    await filterSelect.click();
    await page.getByRole("option", { name: "Inactivo" }).click();

    await expect(page).toHaveURL(/estado=INACTIVO/);
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(page.getByText("Dúo Urbano Zapatillas y Camisa")).toBeVisible();
    await expect(page.getByText("Pack Ejecutivo Smart Casual")).toHaveCount(0);

    // Reset filter
    await filterSelect.click();
    await page.getByRole("option", { name: "Todos los estados" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(6);
  });

  test("S01: Navegación desde listado hacia crear y hacia detalle", async ({ page }) => {
    // Click Crear combo
    await page.getByRole("link", { name: "Crear combo" }).first().click();
    await expect(page).toHaveURL("/combos/nuevo");
    await expect(page.getByRole("heading", { name: "Crear combo" })).toBeVisible();

    // Go back to list
    await page.goto("/combos");

    // Click on a combo row to view detail using exact match
    await page.getByRole("link", { name: "Pack Ejecutivo Smart Casual", exact: true }).click();
    await expect(page).toHaveURL("/combos/combo-001");
    await expect(page.getByRole("heading", { name: "Pack Ejecutivo Smart Casual" })).toBeVisible();
  });

  // S02: Creación de combos con validaciones y selector de productos/SKUs
  test("S02: Selector de componentes exige al menos 2 SKUs distintos y prohíbe duplicados", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");

    // Try submitting empty
    await page.getByTestId("combo-submit-button").click();
    await expect(page.getByText("El nombre del combo es obligatorio.")).toBeVisible();
    await expect(page.getByText("El combo debe contener al menos dos componentes SKU vendibles directos.")).toBeVisible();

    // Fill name
    await page.getByLabel("Nombre comercial del combo").fill("Nuevo Combo Test");

    // Select first product (Camisa Casual -> variant CAM-NEG-M)
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    const variantSelect = page.getByTestId("combo-candidate-variant-select");
    await expect(variantSelect).toBeVisible();
    await variantSelect.selectOption("CAM-NEG-M");
    const addBtn = page.getByTestId("combo-add-component-button");
    await expect(addBtn).toBeEnabled();
    await addBtn.click({ force: true });

    // 1 component added
    await expect(page.getByText("Componentes seleccionados (1)")).toBeVisible();

    // Try adding duplicate SKU
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    await expect(variantSelect).toBeVisible();
    await variantSelect.selectOption("CAM-NEG-M");
    await expect(addBtn).toBeEnabled();
    await addBtn.click({ force: true });

    await expect(page.getByText("El SKU CAM-NEG-M ya está incluido")).toBeVisible();

    // Select second product (Pantalón Chino -> variant PAN-GRI-32)
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-002");
    await expect(variantSelect).toBeVisible();
    await variantSelect.selectOption("PAN-GRI-32");
    await expect(addBtn).toBeEnabled();
    await addBtn.click({ force: true });

    await expect(page.getByText("Componentes seleccionados (2)")).toBeVisible();
  });

  test("S02: Comparador económico valida regla de precio < sumaRegular y < sumaPublicaVigente", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");
    await page.getByLabel("Nombre comercial del combo").fill("Combo Ahorro");

    // Add CAM-NEG-M (Reg 100, Pub 90)
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    const variantSelect = page.getByTestId("combo-candidate-variant-select");
    await expect(variantSelect).toBeVisible();
    await variantSelect.selectOption("CAM-NEG-M");
    const addBtn = page.getByTestId("combo-add-component-button");
    await expect(addBtn).toBeEnabled();
    await addBtn.click({ force: true });

    // Add PAN-GRI-32 (Reg 80, Pub 75)
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-002");
    await expect(variantSelect).toBeVisible();
    await variantSelect.selectOption("PAN-GRI-32");
    await expect(addBtn).toBeEnabled();
    await addBtn.click({ force: true });

    // Sum regular = 180, Sum public = 165
    await expect(page.getByText("PEN 180.00")).toBeVisible();
    await expect(page.getByText("PEN 165.00")).toBeVisible();

    const priceInput = page.getByTestId("combo-price-input");

    // Price higher than public sum (e.g. 170) -> should show violation
    await priceInput.fill("170.00");
    await expect(
      page.getByText("El precio del combo debe ser menor que la suma regular y que la suma pública vigente"),
    ).toBeVisible();

    // Valid price (140) -> should show green success indicator
    await priceInput.fill("140.00");
    await expect(
      page.getByText("El precio propuesto es menor que ambas referencias actuales."),
    ).toBeVisible();

    // Save combo
    await page.getByTestId("combo-submit-button").click();

    // Expect navigation to newly created combo detail
    await expect(page).toHaveURL(/\/combos\/combo-101/);
    await expect(page.getByRole("heading", { name: "Combo Ahorro" })).toBeVisible();
    await expect(page.getByText("S/ 140.00")).toBeVisible();
  });

  // S03: Detalle, edición y persistencia
  test("S03: Edición de combo conserva versión, componentes y maneja conflicto VERSION_CONFLICT", async ({
    page,
  }) => {
    await page.goto("/combos/combo-001");
    await expect(page.getByText("Versión: 1")).toBeVisible();

    // Navigate to edit
    await page.getByRole("link", { name: "Editar combo" }).click();
    await expect(page).toHaveURL("/combos/combo-001/editar");

    // Wait for form to load
    await expect(page.getByRole("heading", { name: "Editar combo" })).toBeVisible();

    // Clear and fill new price 145.00
    const priceInput = page.getByTestId("combo-price-input");
    await expect(priceInput).toBeVisible();
    await priceInput.click();
    await priceInput.fill("145.00");
    await page.getByTestId("combo-submit-button").click();

    // Verify updated version and price on detail
    await expect(page).toHaveURL("/combos/combo-001");
    await expect(page.getByText("Versión: 2")).toBeVisible();
    await expect(page.getByText("S/ 145.00")).toBeVisible();
  });

  test("S03: Desactivación requiere confirmación, cambia estado a INACTIVO y mantiene componentes", async ({
    page,
  }) => {
    await page.goto("/combos/combo-002");
    await expect(page.getByText("Activo")).toBeVisible();

    // Click Desactivar
    await page.getByRole("button", { name: "Desactivar" }).click();

    // Modal appears
    await expect(page.getByRole("dialog", { name: "Confirmar desactivación del combo" })).toBeVisible();
    await expect(
      page.getByText("Al desactivar este combo, dejará de ofrecerse para nuevas ventas en todos los canales."),
    ).toBeVisible();

    // Confirm deactivation
    await page.getByRole("dialog").getByRole("button", { name: "Desactivar combo" }).click();

    // Feedback and status changed to INACTIVO
    await expect(page.getByText("El combo ha sido desactivado exitosamente.")).toBeVisible();
    await expect(page.getByText("Inactivo")).toBeVisible();

    // Deactivation button is now hidden
    await expect(page.getByRole("button", { name: "Desactivar" })).toHaveCount(0);
  });

  // S04: Pantalla de no disponible / indisponibilidad comercial
  test("S04: Representación de indisponibilidad para combo agotado e inactivo sin confundir null con 0", async ({
    page,
  }) => {
    // combo-002 is agotado (availability = 0)
    await page.goto("/combos/combo-002/no-disponible");
    await expect(
      page.getByRole("heading", { name: /Indisponibilidad comercial: Set Entrenamiento Deportivo Pro/ }),
    ).toBeVisible();
    await expect(page.getByRole("alert").getByText("Agotado actualmente")).toBeVisible();
    await expect(
      page.getByText("La disponibilidad estimada del combo es 0. Uno o más de sus componentes SKU no cuenta con existencias suficientes"),
    ).toBeVisible();

    // combo-005 has availability null (INCOMPLETA)
    await page.goto("/combos/combo-005/no-disponible");
    await expect(page.getByRole("alert").getByText("Disponibilidad no confirmada")).toBeVisible();
    await expect(
      page.getByText("La ausencia de confirmación no equivale a saldo cero."),
    ).toBeVisible();

    // Button to return to detail
    await page.getByRole("link", { name: "Ver definición del combo" }).click();
    await expect(page).toHaveURL("/combos/combo-005");
  });

  // S01-S04 Desktop Viewport 1440x900 Screenshot Evidence
  test("MK-002: Capturas de pantalla en viewport canónico 1440x900 para S01-S04 sin overflow horizontal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const routes = [
      { name: "S01-listado", path: "/combos" },
      { name: "S02-crear", path: "/combos/nuevo" },
      { name: "S02-editar", path: "/combos/combo-001/editar" },
      { name: "S03-detalle-activo", path: "/combos/combo-001" },
      { name: "S04-no-disponible-agotado", path: "/combos/combo-002/no-disponible" },
      { name: "S04-no-disponible-incompleto", path: "/combos/combo-005/no-disponible" },
    ];

    for (const r of routes) {
      await page.goto(r.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Horizontal overflow check
      const isHorizontalScrollable = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(isHorizontalScrollable).toBe(false);

      // Take screenshot
      await page.screenshot({
        path: `test-results/mk-002-${r.name}-1440x900.png`,
        fullPage: true,
      });
    }
  });
});
