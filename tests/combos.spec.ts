import { test, expect } from "@playwright/test";
import { MockCombosRepository } from "../src/features/combos/adapters/mockCombosRepository";
import { ComboRepositoryError } from "../src/features/combos/services/combosRepository";

test.describe("MK-002 — Gestión de combos de productos", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await expect(page.getByText("Agotado actualmente (0 un.)")).toBeVisible();
  });

  test("S01: Filtro por estado administrativo actualiza la lista y URL", async ({ page }) => {
    // Filter by INACTIVO
    const filterSelect = page.getByTestId("combo-status-filter");
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
    await page.getByRole("link", { name: "Nuevo combo" }).click();
    await expect(page).toHaveURL("/combos/nuevo");
    await expect(page.getByRole("heading", { name: "Crear combo" })).toBeVisible();

    // Go back to list
    await page.goto("/combos");

    // Click on a combo row to view detail using exact match
    await page.getByRole("link", { name: "Pack Ejecutivo Smart Casual", exact: true }).click();
    await expect(page).toHaveURL("/combos/combo-001");
    await expect(page.getByRole("heading", { name: "Pack Ejecutivo Smart Casual" })).toBeVisible();
  });

  // H11: Error de listado sin presentar estado vacío
  test("S01 (H11): Error de listado muestra FeedbackAlert con reintento y no renderiza estado vacío", async ({
    page,
  }) => {
    // Navigate with deterministic scenario parameter
    await page.goto("/combos?modoRevision=1&escenario=list-error");

    // Error alert must appear
    await expect(page.getByText("Error al cargar el listado de combos.")).toBeVisible();
    // Must NOT render empty state "No hay combos registrados"
    await expect(page.getByText("No hay combos registrados")).toHaveCount(0);
    await expect(page.getByText("No se encontraron combos para el filtro seleccionado")).toHaveCount(0);

    // Clicking retry button clears error scenario and reloads table
    await page.getByTestId("retry-list-btn").click();
    await expect(page.locator("tbody tr")).toHaveCount(6);
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

  // H02: Creación rechazada por SKU no vendible, no encontrado o combo anidado
  test("S02 (H02): Rechazo de SKU no vendible, variante inactiva, no encontrado y combo anidado", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");

    // Select product with inactive variant (PROD-001 has CAM-DISAB-S which is disabled)
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    const variantSelect = page.getByTestId("combo-candidate-variant-select");
    const disabledOption = variantSelect.locator('option[value="CAM-DISAB-S"]');
    await expect(disabledOption).toBeDisabled();

    // Verify Repository rejects non-existent SKU, inactive SKU, and nested combo
    const repo = new MockCombosRepository();

    // 1. Non-existent SKU
    await expect(
      repo.createCombo({
        nombre: "Test Invalido",
        componentes: [
          { sku: "CAM-NEG-M", quantity: 1 },
          { sku: "SKU-INEXISTENTE-999", quantity: 1 },
        ],
        precioCombo: 100,
      }),
    ).rejects.toThrow(ComboRepositoryError);

    // 2. Inactive product SKU
    await expect(
      repo.createCombo({
        nombre: "Test Inactivo",
        componentes: [
          { sku: "CAM-NEG-M", quantity: 1 },
          { sku: "SKU-PROD-INACTIVO", quantity: 1 },
        ],
        precioCombo: 100,
      }),
    ).rejects.toThrow(ComboRepositoryError);

    // 3. Nested combo
    await expect(
      repo.createCombo({
        nombre: "Test Anidado",
        componentes: [
          { sku: "CAM-NEG-M", quantity: 1 },
          { sku: "COMBO-ANIDADO-SKU", quantity: 1 },
        ],
        precioCombo: 100,
      }),
    ).rejects.toThrow(ComboRepositoryError);
  });

  // H10: Cantidad decimal rechazada en UI y en repositorio
  test("S02 (H10): Cantidad decimal o no entera rechazada en UI y en repositorio", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");

    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    await page.getByTestId("combo-candidate-variant-select").selectOption("CAM-NEG-M");

    // Try filling decimal quantity "1.5"
    const qtyInput = page.getByTestId("combo-quantity-input");
    await qtyInput.fill("1.5");
    await page.getByTestId("combo-add-component-button").click({ force: true });

    await expect(
      page.getByText("La cantidad debe ser un número entero positivo mayor o igual a 1"),
    ).toBeVisible();

    // Repo check: rejects decimal quantity
    const repo = new MockCombosRepository();
    await expect(
      repo.createCombo({
        nombre: "Combo Decimal Invalido",
        componentes: [
          { sku: "CAM-NEG-M", quantity: 1.5 },
          { sku: "PAN-GRI-32", quantity: 1 },
        ],
        precioCombo: 120,
      }),
    ).rejects.toThrow(/entero positivo.*mayor o igual a 1/);
  });

  // H05: Edición de cantidad en tabla con actualización de precio y disponibilidad
  test("S02 (H05): Edición de cantidad en tabla actualiza inmediatamente la suma regular y suma pública", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");
    await page.getByLabel("Nombre comercial del combo").fill("Combo Cantidades");

    // Add CAM-NEG-M (Reg 100, Pub 90) x1
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    await page.getByTestId("combo-candidate-variant-select").selectOption("CAM-NEG-M");
    await page.getByTestId("combo-add-component-button").click({ force: true });

    // Add PAN-GRI-32 (Reg 80, Pub 75) x1
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-002");
    await page.getByTestId("combo-candidate-variant-select").selectOption("PAN-GRI-32");
    await page.getByTestId("combo-add-component-button").click({ force: true });

    // Sum regular = 180.00, Sum public = 165.00
    await expect(page.getByText("PEN 180.00")).toBeVisible();
    await expect(page.getByText("PEN 165.00")).toBeVisible();

    // Update quantity of PAN-GRI-32 from 1 to 2
    const panQtyInput = page.getByTestId("combo-quantity-input-PAN-GRI-32");
    await panQtyInput.fill("2");

    // New sums: Reg = 100 + 80*2 = 260.00; Pub = 90 + 75*2 = 240.00
    await expect(page.getByText("PEN 260.00")).toBeVisible();
    await expect(page.getByText("PEN 240.00")).toBeVisible();
  });

  // H07: Fallo de Pricing sin falsa aprobación económica
  test("S02 (H07): Fallo de Pricing muestra alerta explícita, no muestra precios obsoletos y bloquea guardado", async ({
    page,
  }) => {
    // Navigate with pricing-error scenario
    await page.goto("/combos/nuevo?modoRevision=1&escenario=pricing-error");

    // Add CAM-NEG-M
    await page.getByTestId("combo-candidate-product-select").selectOption("PROD-001");
    await page.getByTestId("combo-candidate-variant-select").selectOption("CAM-NEG-M");
    await page.getByTestId("combo-add-component-button").click({ force: true });

    // Pricing failure alert appears
    await expect(page.getByText("Fallo al consultar Pricing de componentes")).toBeVisible();
    await expect(page.getByText("No disponible")).toHaveCount(2);

    // Verify table displays "—" and not stale or zero prices
    const tableFirstRow = page.locator("tbody tr").first();
    await expect(tableFirstRow.locator("td").nth(3)).toHaveText("—");
    await expect(tableFirstRow.locator("td").nth(4)).toHaveText("—");

    // Try submitting: must be blocked because pricing failed
    await page.getByLabel("Nombre comercial del combo").fill("Combo Bloqueado por Pricing");
    await page.getByTestId("combo-price-input").fill("50.00");
    await page.getByTestId("combo-submit-button").click();
    await expect(page.getByText("No se puede confirmar el precio porque falló la consulta de Pricing.")).toBeVisible();

    // Click retry pricing: clears scenario and fetches actual pricing
    await page.getByTestId("retry-pricing-btn").click();
    await expect(page.getByText("PEN 100.00").first()).toBeVisible();
  });

  // H08: Fallo de Pricing en detalle conserva definición administrativa
  test("S03 (H08): Fallo de Pricing en detalle conserva datos administrativos y muestra reintento", async ({
    page,
  }) => {
    // Navigate with pricing-error scenario on detail
    await page.goto("/combos/combo-001?modoRevision=1&escenario=pricing-error");

    // Heading and administrative data MUST still be visible (NOT "Combo no encontrado")
    await expect(page.getByRole("heading", { name: "Pack Ejecutivo Smart Casual" })).toBeVisible();
    await expect(page.getByText("S/ 150.00")).toBeVisible();
    await expect(page.getByText("Estado administrativo:")).toBeVisible();

    // Pricing warning alert is displayed with retry button
    await expect(
      page.getByText("Precios de referencia no disponibles temporalmente"),
    ).toBeVisible();
    await expect(page.getByTestId("retry-detail-pricing-btn")).toBeVisible();

    // Clicking retry recovers pricing
    await page.getByTestId("retry-detail-pricing-btn").click();
    await expect(page.getByText("PEN 180.00")).toBeVisible();
  });

  // H06: Conflicto de versión real y recuperación sin sobrescritura silenciosa
  test("S03 (H06): Conflicto de versión muestra diffs reales y completa ciclo de sincronización y segundo guardado", async ({
    page,
  }) => {
    // Open edit with deterministic version-conflict scenario
    await page.goto("/combos/combo-001/editar?modoRevision=1&escenario=version-conflict");
    await expect(page.getByRole("heading", { name: "Editar combo" })).toBeVisible();

    // Try saving form with modified price
    const priceInput = page.getByTestId("combo-price-input");
    await priceInput.fill("142.00");
    await page.getByTestId("combo-submit-button").click();

    // Version conflict alert with diffs appears
    const conflictAlert = page.getByTestId("version-conflict-alert");
    await expect(conflictAlert).toBeVisible();
    await expect(conflictAlert.getByText("PEN 160.00")).toBeVisible(); // server price changed from 150 to 160
    await expect(conflictAlert.getByText("PEN 142.00")).toBeVisible();

    // Safe resolution option B: Confirm and synchronize version, keeping local draft
    await page.getByTestId("sync-version-keep-draft-btn").click();
    await expect(page.getByTestId("version-conflict-alert")).toHaveCount(0);

    // Now save again: should successfully update without conflict and navigate to detail page
    await page.getByTestId("combo-submit-button").click();
    await expect(page).toHaveURL(/\/combos\/combo-001$/);
    await expect(page.getByText("S/ 142.00")).toBeVisible();
  });

  // H12: Guard de cambios sin guardar
  test("S02 (H12): Cancelar con modificaciones muestra modal de confirmación antes de descartar", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");

    // Modify a field
    await page.getByLabel("Nombre comercial del combo").fill("Borrador No Guardado");

    // Click Cancelar
    await page.getByTestId("combo-cancel-button").click();

    // Modal dialog appears
    const dialog = page.getByRole("dialog", { name: "Descartar cambios sin guardar" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Tienes modificaciones no guardadas en este formulario.")).toBeVisible();

    // Confirm discard
    await page.getByTestId("confirm-discard-button").click();
    await expect(page).toHaveURL("/combos");
  });

  // Navigation Guard: Bloqueo de navegación SPA con modificaciones no guardadas
  test("S02 (Audit P2): Navegación interna por menú con formulario sucio activa modal de confirmación", async ({
    page,
  }) => {
    await page.goto("/combos/nuevo");

    // Modify a field
    await page.getByLabel("Nombre comercial del combo").fill("Borrador con navegación interna");

    // Click on sidebar link to "Productos y variantes"
    const nav = page.getByRole("navigation", { name: "Navegación de la aplicación" });
    await nav.getByRole("link", { name: "Gestión de productos" }).click();

    // Modal dialog MUST appear, blocking navigation
    const dialog = page.getByRole("dialog", { name: "Descartar cambios sin guardar" });
    await expect(dialog).toBeVisible();

    // Click "Continuar editando" -> dialog closes, remains on form
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL("/combos/nuevo");

    // Try navigating again and confirm discard
    await nav.getByRole("link", { name: "Gestión de productos" }).click();
    await expect(dialog).toBeVisible();
    await page.getByTestId("confirm-discard-button").click();
    await expect(page).toHaveURL("/productos");
  });

  // H01: Disponibilidad calculada dinámicamente e invalidada en edición
  test("S01/S03 (H01): Disponibilidad es calculada por min(floor(stock/qty)) y se recalcula al editar", async () => {
    const repo = new MockCombosRepository();

    // Create combo with CAM-NEG-M (stock=50, qty=2) and PAN-GRI-32 (stock=25, qty=1)
    // min(floor(50/2), floor(25/1)) = min(25, 25) = 25
    const created = await repo.createCombo({
      nombre: "Combo Stock Dinamico",
      componentes: [
        { sku: "CAM-NEG-M", quantity: 2 },
        { sku: "PAN-GRI-32", quantity: 1 },
      ],
      precioCombo: 190,
    });

    expect(created.informativeAvailability).toBe(25);
    expect(created.freshness).toBe("ACTUALIZADA");

    // Now update quantity of PAN-GRI-32 to 5 -> min(25, floor(25/5)=5) = 5
    const updated = await repo.updateCombo(created.comboId, {
      nombre: "Combo Stock Dinamico",
      componentes: [
        { sku: "CAM-NEG-M", quantity: 2 },
        { sku: "PAN-GRI-32", quantity: 5 },
      ],
      precioCombo: 180,
      version: 1,
    });

    // Recalculated availability must be 5 (never reusing stale 25 or hardcoded 10)
    expect(updated.informativeAvailability).toBe(5);
  });

  // S03: Desactivación requiere confirmación y cancelación no muta estado
  test("S03: Cancelación de desactivación no muta estado y confirmación desactiva", async ({
    page,
  }) => {
    await page.goto("/combos/combo-001");
    await expect(page.getByText("Activo")).toBeVisible();

    // Click Desactivar
    await page.getByTestId("deactivate-combo-button").click();
    const dialog = page.getByRole("dialog", { name: "Confirmar desactivación del combo" });
    await expect(dialog).toBeVisible();

    // Cancel deactivation
    await page.getByTestId("cancel-deactivate-btn").click();
    await expect(dialog).toHaveCount(0);

    // State remains ACTIVO
    await expect(page.getByText("Activo")).toBeVisible();

    // Open again and confirm
    await page.getByTestId("deactivate-combo-button").click();
    await page.getByTestId("confirm-deactivate-btn").click();

    await expect(page.getByText("Inactivo")).toBeVisible();
  });

  // S04: Pantalla de no disponible
  test("S04: Pantalla de indisponibilidad comercial para combo agotado, desactualizado e inactivo", async ({
    page,
  }) => {
    // combo-001: activo y disponible (la condición de indisponibilidad no aplica)
    await page.goto("/combos/combo-001/no-disponible");
    await expect(
      page.getByRole("heading", {
        name: "Estado de disponibilidad comercial: Pack Ejecutivo Smart Casual",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("available-combo-info-alert")).toBeVisible();
    await expect(page.getByText("La condición de indisponibilidad comercial no aplica actualmente.")).toBeVisible();

    // combo-002: agotado confirmado
    await page.goto("/combos/combo-002/no-disponible");
    await expect(page.getByTestId("sold-out-alert")).toBeVisible();

    // combo-004: desactualizado
    await page.goto("/combos/combo-004/no-disponible");
    await expect(page.getByTestId("stale-availability-alert")).toBeVisible();

    // combo-003: inactivo
    await page.goto("/combos/combo-003/no-disponible");
    await expect(page.getByTestId("inactive-combo-alert")).toBeVisible();

    // combo-005: incompleta
    await page.goto("/combos/combo-005/no-disponible");
    await expect(page.getByTestId("incomplete-availability-alert")).toBeVisible();
  });

  // Desktop 1440x900 screenshots
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

      const isHorizontalScrollable = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(isHorizontalScrollable).toBe(false);

      await page.screenshot({
        path: `test-results/mk-002-${r.name}-1440x900.png`,
        fullPage: true,
      });
    }
  });
});
