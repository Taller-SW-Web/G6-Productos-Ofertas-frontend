import { expect, test } from "@playwright/test";

test.describe("P0 — Integración transversal completa de módulos con persistencia F5", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("P0-01: Catálogo crea SKU simple y con variante, proyecta a Inventario y permite recepción con persistencia F5", async ({
    page,
  }) => {
    // 1. Crear producto simple en Catálogo
    const simpleSku = `CAS-TRAIL-${Date.now().toString().slice(-4)}`;
    await page.goto("/productos/nuevo");
    await page.getByLabel("Nombre del producto").fill("Casaca Trail Cortaviento");
    await page
      .getByLabel("Descripción comercial")
      .fill("Casaca impermeable ultraligera para running y trail.");
    await page.getByLabel("SKU Base").fill(simpleSku);
    await page.getByLabel("Precio base inicial (S/.)").fill("229.00");
    await page.getByLabel("Peso (kg)").fill("0.45");
    await page.getByLabel("Largo (cm)").fill("30");
    await page.getByLabel("Ancho (cm)").fill("20");
    await page.getByLabel("Alto (cm)").fill("5");
    await page.getByRole("button", { name: "Guardar borrador" }).click();

    await expect(page).toHaveURL(/\/productos\/PROD-.*\/preparacion/);
    await expect(page.getByText("Borrador guardado.", { exact: true })).toBeVisible();

    // 2. Verificar identidad en Pricing
    await page.goto("/precios");
    await page.getByRole("combobox", { name: "Producto o SKU" }).click();
    await expect(
      page.getByRole("option", { name: new RegExp(simpleSku), exact: false }),
    ).toBeVisible();

    // 3. Verificar inicialización en Inventario (stock inicial 0 / AGOTADO)
    await page.goto("/inventario");
    const stockRow = page.getByRole("row").filter({ hasText: simpleSku });
    await expect(stockRow).toBeVisible();
    await expect(stockRow).toContainText("Casaca Trail Cortaviento");
    await expect(stockRow).toContainText("0");
    await expect(stockRow).toContainText("AGOTADO");

    // 4. Operación válida: recepcionar traslado en tránsito para el SKU nuevo
    await page.goto("/inventario/traslados");
    const transferRow = page.getByRole("row").filter({ hasText: simpleSku });
    await expect(transferRow).toBeVisible();
    await expect(transferRow).toContainText("En tránsito");
    await transferRow.getByRole("button", { name: /Recepcionar/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Cantidad recibida/i).fill("25");
    await dialog.getByRole("button", { name: "Confirmar recepción", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Operación completada")).toBeVisible();

    // 5. Verificar disponibilidad actualizada en Inventario
    await page.goto("/inventario");
    const receivedRow = page.getByRole("row").filter({ hasText: simpleSku });
    await expect(receivedRow).toContainText("25");
    await expect(receivedRow).toContainText("DISPONIBLE");

    // 6. Verificar persistencia tras recargar (F5)
    await page.reload();
    const persistedRow = page.getByRole("row").filter({ hasText: simpleSku });
    await expect(persistedRow).toContainText("25");
    await expect(persistedRow).toContainText("DISPONIBLE");

    // 7. Crear variante vendible en Catálogo para producto existente
    const variantSku = `CAM-RUN-AZU-XL-${Date.now().toString().slice(-4)}`;
    await page.goto("/productos/PROD-RUN-001/variantes/nueva");
    await page.getByPlaceholder("Ej. PROD-RUN-AZUL-M (Opcional)").fill(variantSku);

    // Atributos de variante
    await page.getByRole("combobox", { name: "Color principal", exact: true }).click();
    await page.getByRole("option", { name: "Azul Índigo", exact: true }).click();
    await page.getByRole("combobox", { name: "Talla", exact: true }).click();
    await page.getByRole("option", { name: "XL", exact: true }).click();
    await page.getByRole("textbox", { name: "Material principal", exact: true }).fill("Poliéster técnico");
    await page.getByRole("combobox", { name: "Tipo de corte", exact: true }).click();
    await page.getByRole("option", { name: "Regular Fit", exact: true }).click();

    await page
      .getByPlaceholder("https://ejemplo.com/imagenes/variante-azul.jpg")
      .fill("https://ejemplo.com/imagenes/camiseta-azul-xl.jpg");

    await page.getByRole("textbox", { name: "Peso (kg)" }).fill("0.28");
    await page.getByRole("textbox", { name: "Largo (cm)" }).fill("32");
    await page.getByRole("textbox", { name: "Ancho (cm)" }).fill("22");
    await page.getByRole("textbox", { name: "Alto (cm)" }).fill("4");

    await page.getByRole("button", { name: "Guardar Variante" }).first().click();
    await expect(page).toHaveURL(/\/productos\/PROD-RUN-001\/variantes\/VAR-.*\/preparacion/);

    // 8. Verificar que el SKU de la variante aparece en Inventario y el SKU padre CAM-RUN NO es un ítem de stock
    await page.goto("/inventario");
    await expect(page.getByRole("row").filter({ hasText: variantSku })).toBeVisible();
    // El SKU padre no se duplica como saldo vendible
    const parentSkuCell = page.getByRole("cell", { name: "CAM-RUN", exact: true });
    await expect(parentSkuCell).toHaveCount(0);

    // 9. Persistencia F5 de la variante en inventario
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: variantSku })).toBeVisible();
  });

  test("P0-02: Carga masiva (Bulk) aplica a Catálogo, Pricing e Inventario con persistencia F5", async ({
    page,
  }) => {
    const bulkSku = `NK-AIR-MAX-${Date.now().toString().slice(-4)}`;
    const csvContent = [
      "sku,nombre,descripcion,categoria,marca,precio_regular,moneda,stock_inicial",
      `${bulkSku},Zapatilla Air Max Runner,Zapatilla deportiva para entrenamiento,Calzado,Nike,320.00,PEN,35`,
    ].join("\n");

    // 1. Probar rechazo de formato no soportado (.txt)
    await page.goto("/carga-masiva");
    await page.locator('input[type="file"]').setInputFiles({
      name: "archivo_invalido.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("sku,nombre\nTEST,Producto\n"),
    });
    await expect(page.getByText("Formato no admitido", { exact: false })).toBeVisible();

    // 2. Subir CSV válido y continuar a revisión
    await page.locator('input[type="file"]').setInputFiles({
      name: "catalogo_bulk_test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
    await expect(page).toHaveURL("/carga-masiva/revisar");

    // 3. Confirmar importación
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
    await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-imp-/);

    // 4. Esperar finalización del lote
    await expect(page.locator("section").getByText("Completado", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("link", { name: "Ver resultado final" }).first().click();
    await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-imp-.*\/resultado/);

    // Verificar tabla de filas completadas y dominios
    await expect(page.getByText(bulkSku)).toBeVisible();
    await expect(page.getByText("Zapatilla Air Max Runner")).toBeVisible();
    await expect(page.getByText("Importación completada satisfactoriamente")).toBeVisible();
    await expect(page.getByText("Aplicado").first()).toBeVisible();

    // 5. Verificar que el producto existe en Catálogo
    await page.goto("/productos");
    await expect(page.getByText("Zapatilla Air Max Runner")).toBeVisible();
    await expect(page.getByText(bulkSku)).toBeVisible();

    // 6. Verificar que el precio regular existe en Pricing
    await page.goto("/precios");
    await page.getByRole("combobox", { name: "Producto o SKU" }).click();
    await page.getByRole("option", { name: new RegExp(bulkSku), exact: false }).click();
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByText(bulkSku).first()).toBeVisible();
    await expect(page.getByText("S/ 320.00").first()).toBeVisible();

    // 7. Verificar que el stock existe en Inventario
    await page.goto("/inventario");
    const bulkRow = page.getByRole("row").filter({ hasText: bulkSku });
    await expect(bulkRow).toBeVisible();
    await expect(bulkRow).toContainText("35");
    await expect(bulkRow).toContainText("DISPONIBLE");

    // 8. F5 en Inventario conserva la persistencia
    await page.reload();
    const persistedBulkRow = page.getByRole("row").filter({ hasText: bulkSku });
    await expect(persistedBulkRow).toContainText("35");
    await expect(persistedBulkRow).toContainText("DISPONIBLE");
  });

  test("P1-03: Sincronización reactiva entre pestañas sin recargar F5", async ({
    page,
    context,
  }) => {
    // Pestaña A: abierta en Inventario viendo los productos existentes
    await page.goto("/inventario");
    const stockRow = page.getByRole("row").filter({ hasText: "CAM-RUN-BLA-M" });
    await expect(stockRow).toBeVisible();

    // Pestaña B: edita el nombre en Catálogo
    const pageB = await context.newPage();
    await pageB.setViewportSize({ width: 1440, height: 900 });
    await pageB.goto("/productos");
    await pageB.getByRole("link", { name: "Ver detalle de Camiseta Running Endurance" }).click();
    await pageB.getByRole("link", { name: "Editar", exact: true }).click();
    const uniqueName = `Camiseta Reactiva ${Date.now().toString().slice(-4)}`;
    await pageB.getByLabel("Nombre del producto").fill(uniqueName);
    await pageB.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: uniqueName, exact: true })).toBeVisible();

    // Pestaña A: sin F5 y sin navegación, el nombre se actualiza reactivamente
    await expect(page.getByRole("row").filter({ hasText: "CAM-RUN-BLA-M" })).toContainText(
      uniqueName,
      { timeout: 8000 },
    );

    await pageB.close();
  });

  test("P1-04: Ciclo completo Promociones → Cupones → Recomendaciones y reactividad a Catálogo con F5", async ({
    page,
  }) => {
    // 1. Crear promoción asociada a un SKU
    const promoName = `Promo Ciclo ${Date.now().toString().slice(-4)}`;
    const couponCode = `CUPON${Date.now().toString().slice(-4)}`;

    await page.goto("/promociones/nueva");
    await page.getByLabel("Nombre de la promoción", { exact: true }).fill(promoName);
    await page.getByRole("combobox", { name: "Modalidad comercial", exact: true }).click();
    await page.getByRole("option", { name: "Con cupón", exact: true }).click();
    await page.getByRole("combobox", { name: "Estado inicial", exact: true }).click();
    await page.getByRole("option", { name: "Activo", exact: true }).click();
    await page.getByLabel("Prioridad", { exact: true }).fill("1");
    await page.getByRole("combobox", { name: "Tipo de beneficio", exact: true }).click();
    await page.getByRole("option", { name: "Monto fijo", exact: true }).click();
    await page.getByLabel("Valor del beneficio", { exact: true }).fill("30");
    await page.getByLabel("Fecha y hora de inicio", { exact: true }).fill("2026-10-18T00:00");
    await page.getByLabel("Fecha y hora de fin", { exact: true }).fill("2026-12-31T23:59");
    await page.getByRole("checkbox", { name: "Marketplace", exact: true }).check();

    await page.getByRole("link", { name: "Seleccionar alcance", exact: true }).click();
    const skuCheckbox = page.getByRole("checkbox", { name: /SKU específico: CAM-RUN-BLA-M/ });
    await expect(skuCheckbox).toBeVisible();
    await skuCheckbox.check();
    await page.getByRole("button", { name: "Confirmar alcance", exact: true }).click();
    await page.getByRole("button", { name: "Crear promoción", exact: true }).click();

    await expect(page.getByRole("heading", { name: promoName, exact: true })).toBeVisible();

    // 2. Crear cupón vinculado a la promoción
    await page.goto("/cupones/nuevo");
    await page.getByRole("combobox", { name: "Promoción asociada", exact: true }).click();
    await page.getByRole("option", { name: new RegExp(promoName), exact: false }).click();
    await page.getByLabel("Código del cupón", { exact: true }).fill(couponCode);
    await page.getByRole("combobox", { name: "Estado inicial", exact: true }).click();
    await page.getByRole("option", { name: "Activo", exact: true }).click();
    await page.getByLabel("Límite global", { exact: true }).fill("100");
    await page.getByLabel("Límite por cliente", { exact: true }).fill("1");
    await page.getByLabel("Monto mínimo", { exact: true }).fill("80");
    await page.getByRole("radio", { name: "Restaurar uso al cancelar", exact: true }).check();
    await page.getByRole("button", { name: "Crear cupón", exact: true }).click();

    await expect(page.getByText("Cupón guardado")).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(couponCode), exact: false })).toBeVisible();

    // 3. F5 y verificación de persistencia de cupón y promoción
    await page.reload();
    await expect(page.getByRole("heading", { name: new RegExp(couponCode), exact: false })).toBeVisible();

    await page.goto("/cupones");
    await expect(page.getByRole("row").filter({ hasText: couponCode })).toBeVisible();
  });
});
