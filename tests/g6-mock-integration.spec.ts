import { expect, test, type Page } from "@playwright/test";

async function receive(page: Page, transferCode: string, quantity: number) {
  const navigation = page.getByRole("navigation", { name: "Navegación de la aplicación" });
  await navigation.getByRole("link", { name: "Traslados de stock", exact: true }).click();
  const row = page.getByRole("row", { name: new RegExp(transferCode) });
  await row.getByRole("button", { name: `Recepcionar traslado ${transferCode}` }).click();

  const dialog = page.getByRole("dialog", { name: /Registrar recepción/ });
  await dialog.getByRole("textbox", { name: "Cantidad recibida físicamente" }).fill(String(quantity));
  await dialog.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByText(new RegExp(`Recepción registrada para traslado ${transferCode}`))).toBeVisible();
  await navigation.getByRole("link", { name: "Control de stock", exact: true }).click();
}

test("Catalog → Pricing → Inventory → Combos comparte identidad, precio y stock en la sesión", async ({ page }) => {
  await page.goto("/productos");
  await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible();
  await page.getByRole("link", { name: "Ver detalle de Camisa Oxford Manga Larga" }).click();
  await expect(page.getByRole("heading", { name: "Camisa Oxford Manga Larga" })).toBeVisible();
  await page.getByRole("link", { name: "Gestionar variantes (MK-004)" }).click();
  await expect(page.getByRole("link", { name: "CAM-OXF-BLA-M", exact: true })).toBeVisible();

  const documentStarted = await page.evaluate(() => performance.timeOrigin);
  const navigation = page.getByRole("navigation", { name: "Navegación de la aplicación" });
  await navigation.getByRole("link", { name: "Consultar precios", exact: true }).click();
  await page.getByRole("combobox", { name: "Producto o SKU" }).click();
  await page.getByRole("option", { name: "Color: Blanco · Talla: M — CAM-OXF-BLA-M", exact: true }).click();
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("SKU: CAM-OXF-BLA-M")).toBeVisible();
  await expect(page.getByText("S/ 139.90").first()).toBeVisible();

  // Confirm a real price edit in Pricing; Combos must read this same repository.
  await page.getByRole("link", { name: "Editar precio", exact: true }).click();
  await page.getByRole("textbox", { name: "Nuevo precio regular", exact: true }).fill("149.90");
  await page.getByRole("textbox", { name: "Motivo del cambio", exact: true }).fill("Ajuste demo transversal");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar cambio de precio", exact: true }).click();
  await expect(page.getByText("Precio actualizado", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Consultar el precio vigente", exact: true }).click();
  await expect(page.getByText("S/ 149.90").first()).toBeVisible();
  await navigation.getByRole("link", { name: "Historial de precios", exact: true }).click();
  await page.getByRole("textbox", { name: "SKU", exact: true }).fill("CAM-OXF-BLA-M");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "CAM-OXF-BLA-M" })).toContainText("149,90");
  await navigation.getByRole("link", { name: "Control de stock", exact: true }).click();
  let stockRow = page.getByRole("row").filter({ hasText: "CAM-OXF-BLA-M" });
  await expect(stockRow).toContainText("8");

  await navigation.getByRole("link", { name: "Gestión de combos", exact: true }).click();
  let comboRow = page.getByRole("row").filter({ hasText: "Conjunto Trail Esencial" });
  await expect(comboRow).toContainText("4 combos estimados");
  await comboRow.getByRole("link", { name: "Ver detalle" }).click();
  await expect(page.getByRole("row").filter({ hasText: "CAM-OXF-BLA-M" })).toContainText("S/ 149.90");
  await expect(page.getByText("4 combos estimados")).toBeVisible();

  // CAM stock changes through Inventory's existing receipt operation.
  await navigation.getByRole("link", { name: "Control de stock", exact: true }).click();
  await receive(page, "TR-2026-101", 5);
  stockRow = page.getByRole("row").filter({ hasText: "CAM-OXF-BLA-M" });
  await expect(stockRow).toContainText("13");

  // Raise the other component above CAM so the combo estimate proves the
  // current Inventory repository is reread after an in-session stock change.
  await receive(page, "TR-2026-100", 5);
  const casacaRow = page.getByRole("row").filter({ hasText: "CAS-COR-001" });
  await expect(casacaRow).toContainText("9");
  await navigation.getByRole("link", { name: "Gestión de combos", exact: true }).click();
  comboRow = page.getByRole("row").filter({ hasText: "Conjunto Trail Esencial" });
  await expect(comboRow).toContainText("9 combos estimados");
  await comboRow.getByRole("link", { name: "Ver detalle" }).click();
  await expect(page.getByText("9 combos estimados")).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
});
