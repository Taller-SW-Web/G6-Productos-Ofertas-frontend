import { test, expect } from "@playwright/test";

test("filters reset pagination, details preserve context and stale loading cannot replace results", async ({
  page,
}) => {
  await page.goto("/foundation/listados");
  await expect(
    page.getByRole("textbox", { name: "Buscar ejemplos", exact: true }),
  ).toHaveCSS("padding-left", "40px");
  await expect(
    page.getByText("Kit entrenamiento diario", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page.getByText("Mostrando 4 a 6 de 6")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar ejemplos", exact: true })
    .fill("botella");
  await expect(page.getByText("Mostrando 1 a 1 de 1")).toBeVisible();
  const detailButton = page.getByRole("button", {
    name: "Ver detalle de Botella térmica deportiva",
  });
  await detailButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailButton).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Buscar ejemplos", exact: true }),
  ).toHaveValue("botella");
  await page
    .getByRole("combobox", { name: "Escenario de revisión", exact: true })
    .click();
  await page.getByRole("option", { name: "Cargando", exact: true }).click();
  await expect(page.getByText("Cargando…", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Escenario de revisión", exact: true })
    .click();
  await page.getByRole("option", { name: "Con datos", exact: true }).click();
  await expect(page.getByText("Mostrando 1 a 1 de 1")).toBeVisible();
  await expect(page.getByText("Cargando…", { exact: true })).not.toBeVisible();
});

test("empty, no matches and recoverable error remain distinct", async ({
  page,
}) => {
  await page.goto("/foundation/listados");
  await page
    .getByRole("textbox", { name: "Buscar ejemplos", exact: true })
    .fill("inexistente");
  await expect(
    page.getByText("Sin coincidencias", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restablecer filtros" }).click();
  await page
    .getByRole("combobox", { name: "Escenario de revisión", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Sin registros", exact: true })
    .click();
  await expect(
    page.getByText("Este escenario de demostración no contiene registros."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar ejemplos", exact: true })
    .fill("kit");
  await page
    .getByRole("combobox", { name: "Escenario de revisión", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Error de consulta", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Los filtros se conservan",
  );
  await page.getByRole("button", { name: "Volver a consultar" }).click();
  await expect(
    page.getByRole("textbox", { name: "Buscar ejemplos", exact: true }),
  ).toHaveValue("kit");
  await expect(
    page.getByText("Kit entrenamiento diario", { exact: true }),
  ).toBeVisible();
});

test("form validation, safe dialog focus, cancellation and failure preserve entries", async ({
  page,
}) => {
  await page.goto("/foundation/formularios");
  const inputBox = await page.getByLabel("Nombre del ejemplo").boundingBox();
  const helpBox = await page
    .getByText("Etiqueta visible para revisar el formulario.")
    .boundingBox();
  expect(helpBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
  await page.getByRole("button", { name: "Revisar ejemplo" }).click();
  await expect(page.getByLabel("Nombre del ejemplo")).toBeFocused();
  await expect(
    page.getByText("Ingresa un nombre para este ejemplo."),
  ).toBeVisible();
  await page.getByLabel("Nombre del ejemplo").fill("Ejemplo para revisión");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Contenido que debe conservarse");
  await page.getByRole("button", { name: "Revisar ejemplo" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Revisar ejemplo" }),
  ).toBeFocused();
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue(
    "Contenido que debe conservarse",
  );
  await page.getByLabel("Simular fallo de confirmación").check();
  await page.getByRole("button", { name: "Revisar ejemplo" }).click();
  await page
    .getByRole("button", { name: "Confirmar ejemplo", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Tus entradas se conservan",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByLabel("Simular fallo de confirmación").uncheck();
  await page.getByRole("button", { name: "Revisar ejemplo" }).click();
  await page
    .getByRole("button", { name: "Confirmar ejemplo", exact: true })
    .click();
  await expect(
    page.getByText("Ejemplo confirmado", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre del ejemplo")).toHaveValue(
    "Ejemplo para revisión",
  );
});

test("desktop geometry, fonts, tokens, focus and screenshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [route, heading, image] of [
    ["/foundation/listados", "Listados y filtros", "listados-1440.png"],
    [
      "/foundation/formularios",
      "Formularios y confirmación",
      "formularios-1440.png",
    ],
    ["/foundation/estados", "Mensajes y estados", "estados-1440.png"],
  ]) {
    await page.goto(route!);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= 1440),
    ).toBe(true);
    expect(
      await page
        .locator("header")
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(64);
    expect(
      await page
        .getByRole("heading", { level: 1 })
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe("32px");
    expect(
      await page.evaluate(
        () =>
          document.fonts.check("700 32px Oswald") &&
          document.fonts.check("400 16px Inter"),
      ),
    ).toBe(true);
    await page.screenshot({ path: `docs/evidencias/${image}`, fullPage: true });
  }
  const primary = page.getByRole("button", { name: "Abrir confirmación" });
  await expect(primary).toHaveCSS("background-color", "rgb(247, 103, 7)");
  await expect(primary).toHaveCSS("color", "rgb(27, 24, 18)");
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(194, 65, 12)");
  await expect(primary).toHaveCSS("color", "rgb(247, 245, 240)");
  await primary.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar carga de ejemplo" }),
  ).toHaveCSS("outline-color", "rgb(67, 97, 238)");
  await primary.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "docs/evidencias/confirmacion-1440.png" });
  expect(errors).toEqual([]);
});

test("unknown routes give a working return link", async ({ page }) => {
  await page.goto("/no-existe");
  await expect(
    page.getByRole("heading", { name: "Página no encontrada" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Volver a la galería" }).click();
  await expect(
    page.getByRole("heading", { name: "Listados y filtros" }),
  ).toBeVisible();
});
