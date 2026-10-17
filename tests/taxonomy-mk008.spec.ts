import { expect, test, type Page } from "@playwright/test";

type CategoryMockScenarios = {
  detalle?: "default" | "no-encontrado" | "error";
  slug?: "default" | "slug-sin-colision" | "slug-con-colision" | "slug-carrera-409";
  baja?:
    | "default"
    | "rechazada-subcategorias"
    | "rechazada-productos"
    | "rechazada-asincrona"
    | "pendiente-prolongado"
    | "error-consulta"
    | "error";
  reactivacion?: "default" | "bloqueada" | "error";
  arbol?: "default" | "empty" | "error";
};

async function setCategoryScenario(
  page: Page,
  scenarios: CategoryMockScenarios,
): Promise<void> {
  await page.evaluate(async (configuration) => {
    const adapterPath = "/src/features/taxonomy/adapters/mockCategoryAdapter.ts";
    const adapter = await import(adapterPath);
    adapter.__setCategoryMockScenarios(configuration);
  }, scenarios);
}

async function admitDeactivation(
  page: Page,
  categoryId: string,
  scenario: CategoryMockScenarios,
): Promise<void> {
  await page.goto(`/categorias/${categoryId}/desactivar`);
  await setCategoryScenario(page, scenario);
  await page.getByRole("button", { name: "Solicitar desactivación" }).click();
  await page.getByRole("dialog", { name: "Confirmar solicitud de baja" })
    .getByRole("button", { name: "Solicitar baja" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Verificando baja" }),
  ).toBeVisible();
}

test.describe("MK-008 mock funcional", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("captura evidencia de las nueve vistas y variantes P0 a 1440 × 900", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/categorias");
    await expect(page.getByRole("heading", { name: "Categorías" })).toBeVisible();
    await expect(page.getByText("Calzado", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s01-1440.png" });

    await page.goto("/categorias/nueva");
    await expect(page.getByRole("heading", { name: "Crear categoría" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s02-1440.png" });
    await page.getByLabel("Nombre").fill("Categoría de evidencia");
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByRole("dialog", { name: "Confirmar slug SEO" })).toBeVisible();
    await page.getByLabel("Slug (URL)").waitFor();
    await page.screenshot({ path: "docs/evidencias/mk-008-s02-c-1440.png" });

    await page.goto("/categorias/running/editar");
    await expect(page.getByRole("heading", { name: "Editar categoría" })).toBeVisible();
    await expect(page.getByLabel("Nombre")).toHaveValue("Running");
    await page.screenshot({ path: "docs/evidencias/mk-008-s03-1440.png" });

    await page.goto("/categorias/casual/desactivar");
    await page.getByRole("button", { name: "Solicitar desactivación" }).click();
    const requestDialog = page.getByRole("dialog", { name: "Confirmar solicitud de baja" });
    await expect(requestDialog).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "docs/evidencias/mk-008-s04-1440.png" });
    await requestDialog
      .getByRole("button", { name: "Solicitar baja" })
      .click();
    await expect(requestDialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Verificando baja" }),
    ).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s04-p-1440.png" });

    await page.goto("/categorias/calzado/desactivar");
    await page.getByRole("button", { name: "Solicitar desactivación" }).click();
    const rejectedDialog = page.getByRole("dialog", { name: "Confirmar solicitud de baja" });
    await rejectedDialog
      .getByRole("button", { name: "Solicitar baja" })
      .click();
    await expect(rejectedDialog).toHaveCount(0);
    await expect(page.getByRole("alert", { name: "Baja rechazada" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s04-b-1440.png" });

    await page.goto("/categorias/calzado");
    await expect(page.getByRole("heading", { name: "Calzado", level: 1 })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s05-1440.png" });

    await page.goto("/categorias/hija-padre-inactivo");
    await page.getByRole("button", { name: "Reactivar", exact: true }).click();
    await expect(page.getByRole("alert", { name: "Reactivación bloqueada" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-008-s05-r-1440.png" });
  });

  test("S01 distingue árbol vacío y error de lectura, y permite reintentar", async ({
    page,
  }) => {
    await page.goto("/categorias");
    await setCategoryScenario(page, { arbol: "empty" });
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Sin categorías", { exact: true })).toBeVisible();

    await setCategoryScenario(page, { arbol: "error" });
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo cargar el árbol");
    await setCategoryScenario(page, { arbol: "default" });
    await page.getByRole("button", { name: "Reintentar consulta" }).click();
    await expect(page.getByText("Calzado", { exact: true })).toBeVisible();
  });

  test("S02 valida requeridos y explica por qué una subcategoría no puede ser padre", async ({
    page,
  }) => {
    await page.goto("/categorias/nueva");
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByText("Ingresa el nombre de la categoría.")).toBeVisible();

    await page.getByLabel("Nombre").fill("Subcategoría de demostración");
    const parent = page.getByRole("combobox", { name: "Categoría padre (opcional)" });
    await parent.click();
    await expect(
      page.getByRole("option", {
        name: /Calzado \/ Running .*máximo dos niveles/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  test("S02-C resuelve una carrera 409, conserva el borrador y exige confirmar la nueva propuesta", async ({
    page,
  }) => {
    await page.goto("/categorias/nueva");
    await setCategoryScenario(page, { slug: "slug-carrera-409" });
    await page.getByLabel("Nombre").fill("Deportes concurrentes QA");
    await page.getByLabel("Descripción (opcional)").fill("Borrador conservado");
    await page.getByRole("button", { name: "Crear categoría" }).click();

    const dialog = page.getByRole("dialog", { name: "Confirmar slug SEO" });
    await expect(dialog.getByLabel("Slug (URL)")).toHaveValue(
      "deportes-concurrentes-qa",
    );
    await dialog.getByRole("button", { name: "Crear categoría" }).click();

    await expect(dialog.getByText("El slug ya está en uso")).toBeVisible();
    await expect(dialog.getByText(/El slug dejó de estar disponible/)).toBeVisible();
    await dialog.getByRole("button", { name: "Usar alternativa" }).click();
    await expect(dialog.getByLabel("Slug (URL)")).toHaveValue(
      "deportes-concurrentes-qa-2",
    );
    await dialog.getByRole("button", { name: "Crear categoría" }).click();

    const created = page.getByRole("status", { name: "Categoría creada" });
    await expect(created).toContainText("Deportes concurrentes QA");
    await expect(created).toContainText("deportes-concurrentes-qa-2");
    await page.getByRole("button", { name: "Ver categoría" }).click();
    await expect(page.getByText("Borrador conservado")).toBeVisible();
  });

  test("S03 guarda el cambio sin regenerar el slug y mantiene errores corregibles", async ({
    page,
  }) => {
    await page.goto("/categorias/calzado/editar");
    await expect(page.getByLabel("Slug (URL)")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Confirmar slug SEO" })).toHaveCount(0);
    await page.getByLabel("Nombre").fill("Calzado actualizado QA");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    const updated = page.getByRole("status", { name: "Categoría actualizada" });
    await expect(updated).toContainText("Calzado actualizado QA");
    await expect(updated).toContainText("calzado");

    await page.goto("/categorias/running/editar");
    const parent = page.getByRole("combobox", { name: "Categoría padre (opcional)" });
    await parent.click();
    await expect(
      page.getByRole("option", {
        name: /Calzado \/ Running .*máximo dos niveles/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  test("S04-P conserva pendiente prolongado sin inventar progreso", async ({ page }) => {
    await admitDeactivation(page, "casual", { baja: "pendiente-prolongado" });

    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Baja aún en verificación" }),
    ).toContainText("no se ha desactivado");
    await expect(page.getByRole("button", { name: "Consultar estado" })).toBeVisible();
  });

  test("S04 permite cancelar y regresar al detalle sin cambiar el estado", async ({
    page,
  }) => {
    await page.goto("/categorias/casual/desactivar");
    await page.getByRole("button", { name: "Solicitar desactivación" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmar solicitud de baja" });
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).toHaveURL("/categorias/casual");
    await expect(page.getByText("Activo", { exact: true }).first()).toBeVisible();
  });

  test("S04-P error de consulta mantiene la baja sin confirmar", async ({ page }) => {
    await admitDeactivation(page, "casual", { baja: "error-consulta" });

    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo consultar el estado");
    await expect(
      page.getByRole("status").filter({ hasText: "Verificando baja" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("Baja confirmada");
  });

  test("S04-B muestra el rechazo terminal y conserva la categoría activa", async ({ page }) => {
    await admitDeactivation(page, "casual", { baja: "rechazada-asincrona" });

    await page.getByRole("button", { name: "Consultar estado" }).click();
    const rejection = page.getByRole("alert", { name: "Baja rechazada" });
    await expect(rejection).toContainText("continúa activa");
    await expect(rejection).toContainText("Activo");
  });
});
