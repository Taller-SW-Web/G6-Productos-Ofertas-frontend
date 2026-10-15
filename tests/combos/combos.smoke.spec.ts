import { expect, test } from "@playwright/test";

test("recorrido de listado, variante explícita, precio, creación, detalle y desactivación", async ({ page }) => {
  await page.goto("/combos");
  await expect(page.getByRole("heading", { name: "Gestión de combos" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navegación de la aplicación" });
  await expect(navigation.getByRole("link")).toHaveCount(15);
  await expect(navigation.getByRole("link", { name: "Gestión de combos", exact: true })).toHaveAttribute("href", "/combos");
  await page.getByRole("link", { name: "Crear combo" }).first().click();
  await expect(page.getByRole("heading", { name: "Crear combo" })).toBeVisible();
  await page.getByRole("textbox", { name: "Nombre" }).fill("Kit de prueba smoke");
  await page.getByRole("combobox", { name: "Producto" }).click();
  await page.getByRole("option", { name: "Bandas Pro por resistencia" }).click();
  await page.getByRole("combobox", { name: "Variante / SKU" }).click();
  await page.getByRole("option", { name: "Ligera · INKA-BAND-03" }).click();
  await page.getByRole("button", { name: "Agregar componente" }).click();
  await page.getByRole("combobox", { name: "Producto" }).click();
  await page.getByRole("option", { name: "Mat de entrenamiento" }).click();
  await page.getByRole("button", { name: "Agregar componente" }).click();
  await expect(page.getByRole("region", { name: "Comparación económica" })).toContainText("Suma pública vigente");
  await page.getByRole("textbox", { name: "Precio comercial del combo (PEN)" }).fill("110.00");
  await expect(page.getByText("El precio es menor que las sumas regular y pública vigente para los componentes seleccionados.")).toBeVisible();
  await page.getByRole("button", { name: "Crear combo" }).last().click();
  await expect(page.getByRole("heading", { name: "Kit de prueba smoke" })).toBeVisible();
  await expect(page.getByText("INKA-BAND-03")).toBeVisible();
  await expect(page.getByText("No se puede confirmar la disponibilidad actual.").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/combos-1440.png", animations: "disabled" });
  await page.getByRole("button", { name: "Desactivar combo" }).click();
  await expect(page.getByRole("dialog")).toContainText("Su definición histórica y sus componentes permanecerán conservados.");
  await page.getByRole("dialog").getByRole("button", { name: "Desactivar combo" }).click();
  await expect(page.getByText("INACTIVO", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver situación de disponibilidad" }).click();
  await expect(page.getByRole("status").getByText("No disponible para nuevas ventas")).toBeVisible();
});

test("VERSION_CONFLICT conserva los cambios locales y permite consultar la versión actual", async ({ page }) => {
  await page.goto("/combos/combo-entrenamiento/editar?scenario=version-conflict");
  await expect(page.getByRole("heading", { name: "Editar combo" })).toBeVisible();
  const name = page.getByRole("textbox", { name: "Nombre" });
  await expect(name).toHaveValue("Set de entrenamiento esencial");
  await name.fill("Propuesta local conservada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("alert")).toContainText("Hay cambios en el servidor");
  await expect(name).toHaveValue("Propuesta local conservada");
  await expect(page.getByRole("button", { name: "Consultar versión actual" })).toBeVisible();

  await page.goto("/combos/combo-entrenamiento/editar?scenario=server-price-rejected");
  const rejectedName = page.getByRole("textbox", { name: "Nombre" });
  await rejectedName.fill("Borrador tras rechazo");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo guardar el precio");
  await expect(rejectedName).toHaveValue("Borrador tras rechazo");
  await expect(page.getByText("INKA-BAND-01")).toBeVisible();
});
