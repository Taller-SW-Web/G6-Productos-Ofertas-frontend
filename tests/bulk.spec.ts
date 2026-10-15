import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("Bulk smoke: selección, revisión local, admisión y seguimiento", async ({ page }) => {
  await page.goto("/carga-masiva");
  await expectNoHorizontalOverflow(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "catalogo_smoke.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku,nombre\nSKU-101,Producto 101\nSKU-102,Producto 102\n"),
  });

  await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
  await expect(page).toHaveURL("/carga-masiva/revisar");
  await expect(page.getByRole("heading", { name: /Revisión de archivo/ })).toBeVisible();
  await expect(page.getByText("Filas detectadas")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page).toHaveURL(/\/carga-masiva\/importaciones\/lote-imp-/);
  await expect(page.getByText("En cola de procesamiento")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/carga-masiva");
  await page.locator('input[type="file"]').setInputFiles({
    name: "catalogo_invalido.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku,nombre\nSKU-201,Producto 201\n"),
  });
  await page.getByRole("button", { name: "Continuar a revisión", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).first().click();
  await expect(page.getByText("Archivo rechazado en la admisión")).toBeVisible();
  await expect(page.getByText("catalogo_invalido.csv")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar importación", exact: true }).first(),
  ).toBeEnabled();
});

test("Bulk smoke: resultado parcial y acciones compatibles con el lote", async ({ page }) => {
  await page.goto("/carga-masiva/importaciones/batch-partial/resultado");
  await expect(page.getByText("Completado con observaciones")).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar reporte de errores" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reanudar operaciones pendientes" })).toBeEnabled();
  await expect(page.locator("table")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/carga-masiva/importaciones/batch-failed-general/resultado");
  await expect(page.getByText("Fallo general", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reanudar operaciones pendientes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Descargar reporte de errores" })).toHaveCount(0);
  await expect(page.getByText("No hay un recurso de reporte descargable para este lote.")).toBeVisible();

  await page.goto("/carga-masiva/importaciones/lote-inexistente");
  await expect(page.getByText("Lote no encontrado")).toBeVisible();
  await page.goto("/carga-masiva/importaciones/batch-status-unavailable");
  await expect(page.getByText("Error al consultar el seguimiento")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar consulta" })).toBeEnabled();
});

test("Bulk smoke: exportación completa CSV con estados asíncronos", async ({ page }) => {
  await page.goto("/carga-masiva/descargas");
  await expect(page.getByRole("heading", { name: "Descargas y exportación masiva" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "CSV de ejemplo" })).toBeChecked();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Solicitar exportación" }).click();
  await expect(page.getByText(/Trabajo de exportación: exp-/)).toBeVisible();
  await expect(page.getByText("En cola", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/carga-masiva/descargas?export_id=export-completed-xlsx");
  await expect(page.getByText("XLSX completado sin archivo descargable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Descarga XLSX no disponible en demo" })).toBeDisabled();

  await page.goto("/carga-masiva/descargas?export_id=export-inexistente");
  await expect(page.getByText("Exportación no encontrada")).toBeVisible();
  await page.goto("/carga-masiva/descargas?export_id=export-status-unavailable");
  await expect(page.getByText("No se pudo consultar la exportación")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar consulta" })).toBeEnabled();
});
