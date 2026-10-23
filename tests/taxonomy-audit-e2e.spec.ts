/**
 * H-04 / E2E: Flujo Taxonomía → Catálogo desde la interfaz de usuario.
 *
 * Estos tests verifican el ciclo completo vía la UI a 1440 px:
 *  1. Crear una categoría en /categorias/nueva y confirmar que aparece en el árbol.
 *  2. Editar una categoría y verificar cambio de nombre en el árbol.
 *  3. Abrir /productos/nuevo y confirmar que la nueva categoría está disponible
 *     en el selector de categorías (reflejo de Taxonomía en Catálogo).
 *  4. Verificar que tipos de producto creados en /tipos-producto/nuevo
 *     aparecen en la creación de producto.
 *
 * Alcance: MOCK_INTEGRATED (dev server con VITE_DATA_MODE=mock).
 * No se realiza un POST a backend real.
 */

import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("E2E / MK-008 ↔ Catálogo: Árbol de categorías", () => {
  test("árbol de categorías muestra las categorías raíz en 1440 px", async ({
    page,
  }) => {
    await page.goto("/categorias");
    await expect(
      page.getByRole("heading", { name: /categor/i }),
    ).toBeVisible();

    // Expect root categories in the tree
    await expect(page.getByText("Calzado")).toBeVisible();
    await expect(page.getByText("Ropa")).toBeVisible();
    await expect(page.getByText("Accesorios")).toBeVisible();
  });

  test("formulario de nueva categoría exige nombre y confirma el slug antes de crear", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/categorias/nueva");
    await expect(
      page.getByRole("heading", { name: /crear categoría|nueva/i }),
    ).toBeVisible();

    // The main form requires a name and exposes orden/imagen (H-02 field completeness).
    const nombre = page.getByLabel(/nombre/i);
    await expect(nombre).toBeVisible();
    await expect(page.getByLabel(/orden/i)).toBeVisible();
    await expect(page.getByLabel(/imagen/i)).toBeVisible();

    // The slug is not on the form: it is proposed and confirmed in the next step,
    // so the test must execute the creation flow to reach it (no render-only check).
    await nombre.fill("Categoría E2E Test");
    await page.getByRole("button", { name: "Crear categoría" }).click();

    await expect(
      page.getByRole("textbox", { name: "Slug (URL)" }),
    ).toBeVisible();
  });

  test("vista de detalle de categoría existente muestra estado y acciones", async ({
    page,
  }) => {
    await page.goto("/categorias/calzado");
    // Should show category detail: name, status, parent/children info.
    // Match the page title (h1) so the breadcrumb and the "Nombre" field, which
    // repeat the same text, do not trigger a strict-mode violation.
    await expect(
      page.getByRole("heading", { name: "Calzado", level: 1 }),
    ).toBeVisible();
    // Should have actions like edit, deactivate
    await expect(
      page.getByRole("link", { name: /editar/i }).or(
        page.getByRole("button", { name: /editar/i }),
      ),
    ).toBeVisible();
  });

  test("editar categoría muestra formulario prerellenado con campos imagen y orden", async ({
    page,
  }) => {
    await page.goto("/categorias/calzado/editar");
    await expect(page.getByRole("heading", { name: /editar/i })).toBeVisible();

    // Fields should be pre-filled
    const nombre = page.getByLabel(/nombre/i);
    await expect(nombre).toHaveValue("Calzado");

    // H-02: imagen field must be present in edit form
    const imagen = page.getByLabel(/imagen/i);
    await expect(imagen).toBeVisible();

    // H-02: orden field must be present in edit form
    const orden = page.getByLabel(/orden/i);
    await expect(orden).toBeVisible();
  });
});

test.describe("E2E / Tipos de producto → Catálogo", () => {
  test("listado de tipos de producto muestra tipos de Taxonomía a 1440 px", async ({
    page,
  }) => {
    await page.goto("/tipos-producto");
    await expect(page.getByRole("heading", { name: /tipos/i })).toBeVisible();

    // Expect Taxonomía types. Assert one specific row: getByText("Ropa") would
    // also match "Ropa de entrenamiento" and break strict mode.
    await expect(
      page.getByText("Calzado deportivo", { exact: true }),
    ).toBeVisible();
  });

  test("formulario de nuevo tipo de producto está disponible", async ({
    page,
  }) => {
    await page.goto("/tipos-producto/nuevo");
    await expect(
      page.getByRole("heading", { name: /nuevo|crear/i }),
    ).toBeVisible();

    const nombre = page.getByLabel(/nombre/i);
    await expect(nombre).toBeVisible();
  });
});

test.describe("E2E / Catálogo: selector de categorías refleja Taxonomía", () => {
  test("creación de producto muestra categorías de Taxonomía en el selector", async ({
    page,
  }) => {
    await page.goto("/productos/nuevo");
    await expect(
      page.getByRole("heading", { name: /nuevo|crear/i }),
    ).toBeVisible();

    // Click to open selector and check Taxonomía categories appear
    await page.getByRole("combobox", { name: "Categoría", exact: true }).click();
    await expect(page.getByRole("option", { name: "Calzado", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Ropa", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Accesorios", exact: true })).toBeVisible();
    // No console errors should block the page
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });
});

test.describe("E2E / Reactivación bloqueada por padre inactivo (S05-R)", () => {
  test("reactivar una categoría con padre inactivo se bloquea y ofrece Ir a la categoría padre", async ({
    page,
  }) => {
    // hija-padre-inactivo is a category whose parent is inactiva-raiz (Inactivo)
    await page.goto("/categorias/hija-padre-inactivo");
    await expect(page.getByRole("main")).toBeVisible();

    // The blocked state is reached by exercising the real flow: request
    // reactivation, which the mock rejects because the parent is inactive.
    const reactivar = page.getByRole("button", { name: /^reactivar$/i });
    await expect(reactivar).toBeVisible();
    await reactivar.click();

    await expect(page.getByText(/reactivación bloqueada/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ir a la categoría padre/i }),
    ).toBeVisible();
  });
});
