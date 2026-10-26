import { expect, test, type Page } from "@playwright/test";
import { MockTaxonomyRepository } from "../src/features/catalog/adapters/mockTaxonomyRepository";
import { __resetCharacteristicStore } from "../src/features/taxonomy/adapters/mockCharacteristicAdapter";
import { characteristicService } from "../src/features/taxonomy/services/characteristicService";

type CharacteristicMockScenarios = {
  lista?: "default" | "empty" | "error";
  catalogo?: "default" | "error" | "no-encontrado";
  formulario?: "default" | "error";
  valores?: "default" | "empty" | "lista-limite" | "error";
  baja?:
    | "default"
    | "error-solicitud"
    | "pendiente-prolongado"
    | "error-consulta"
    | "rechazada-asincrona"
    | "no-concluyente";
};

async function setCharacteristicScenario(
  page: Page,
  scenarios: CharacteristicMockScenarios,
): Promise<void> {
  await page.evaluate(async (configuration) => {
    const adapterPath = "/src/features/taxonomy/adapters/mockCharacteristicAdapter.ts";
    const adapter = await import(adapterPath);
    adapter.__setCharacteristicMockScenarios(configuration);
  }, scenarios);
}

async function resetCharacteristicMock(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const adapterPath = "/src/features/taxonomy/adapters/mockCharacteristicAdapter.ts";
    const adapter = await import(adapterPath);
    adapter.__resetCharacteristicStore();
  });
}

async function reopenValues(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Volver al detalle" }).click();
  await page.getByRole("button", { name: "Gestionar valores" }).click();
  await expect(page).toHaveURL(/\/caracteristicas\/[^/]+\/valores$/);
  await expect(page.getByRole("heading", { level: 1, name: /Valores de:/ })).toBeVisible();
}

test.describe("MK-009 mock funcional", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renombrar un valor conserva su ID y actualiza las opciones mock consultadas por Cat├ílogo", async () => {
    __resetCharacteristicStore();
    try {
      const antes = await characteristicService.listarValores("color");
      const negro = antes?.find((valor) => valor.valorId === "negro");
      expect(negro).toBeDefined();

      const renombrado = await characteristicService.renombrarValor(
        "color",
        "negro",
        "Negro grafito",
      );
      expect(renombrado.valorId).toBe("negro");

      const esquema = await new MockTaxonomyRepository().getAttributeSchema("ropa");
      const color = esquema.find((atributo) => atributo.caracteristicaId === "color");
      expect(color?.opciones).toContainEqual({ id: "negro", valor: "Negro grafito" });
      expect(color?.opciones).not.toContainEqual({ id: "negro", valor: "Negro" });
    } finally {
      __resetCharacteristicStore();
    }
  });

  test("captura evidencia de las ocho pantallas y variantes P0 a 1440 ├ù 900", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/caracteristicas");
    await expect(page.getByText("Talla", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s01-1440.png" });

    await page.goto("/caracteristicas/nueva");
    await expect(page.getByRole("heading", { name: "Crear caracter├¡stica" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s02-1440.png" });

    await page.goto("/caracteristicas/talla/editar");
    await expect(page.getByRole("textbox", { name: "Tipo" })).toHaveValue("Lista");
    await page.screenshot({ path: "docs/evidencias/mk-009-s03-1440.png" });

    await page.goto("/caracteristicas/color/valores");
    await expect(page.getByText("Negro", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s04-1440.png" });
    await setCharacteristicScenario(page, { baja: "pendiente-prolongado" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    await expect(page.getByRole("button", { name: "Consultar estado" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s04-p-1440.png" });

    await page.goto("/caracteristicas/color/valores");
    await setCharacteristicScenario(page, { baja: "rechazada-asincrona" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByRole("alert", { name: "No se pudo dar de baja el valor" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s04-r-1440.png" });

    await page.goto("/caracteristicas/material/estado");
    await expect(page.getByRole("heading", { name: "Estado de: Material" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s05-1440.png" });

    await page.goto("/caracteristicas/color");
    await expect(page.getByRole("heading", { name: "Color", level: 1 })).toBeVisible();
    await expect(page.getByText("negro", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-009-s06-1440.png" });
  });

  test("S01 expone su estado de carga mientras consulta el adapter mock", async ({
    page,
  }) => {
    await page.goto("/caracteristicas", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("status", { name: "Cargando listado de caracter├¡sticas" }),
    ).toBeVisible();
    await expect(page.getByText("Talla", { exact: true })).toBeVisible();
  });

  test("S01 distingue listado vac├¡o y error con reintento; busca por tipo", async ({
    page,
  }) => {
    await page.goto("/caracteristicas");
    const search = page.getByRole("textbox", { name: "Buscar caracter├¡stica" });
    await search.fill("LISTA");
    await expect(page.getByText("Talla", { exact: true })).toBeVisible();
    await expect(page.getByText("Peso", { exact: true })).toHaveCount(0);
    await search.fill("");

    await setCharacteristicScenario(page, { lista: "empty" });
    await page.getByRole("button", { name: "Crear caracter├¡stica" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Sin caracter├¡sticas", { exact: true })).toBeVisible();

    await setCharacteristicScenario(page, { lista: "error" });
    await page.getByRole("button", { name: "Crear caracter├¡stica" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudieron cargar las caracter├¡sticas");
    await setCharacteristicScenario(page, { lista: "default" });
    await page.getByRole("button", { name: "Volver a intentar" }).click();
    await expect(page.getByText("Talla", { exact: true })).toBeVisible();
  });

  test("S02 valida nombre y unidad NUMERO y crea usando el mock", async ({ page }) => {
    await page.goto("/caracteristicas/nueva");
    await page.getByRole("button", { name: "Crear caracter├¡stica", exact: true }).click();
    await expect(page.getByText("Ingresa el nombre de la caracter├¡stica.")).toBeVisible();

    await page.getByLabel("Nombre").fill("Peso de demostraci├│n");
    await page.getByRole("combobox", { name: "Tipo" }).click();
    await page.getByRole("option", { name: "N├║mero" }).click();
    await page.getByRole("button", { name: "Crear caracter├¡stica", exact: true }).click();
    await expect(page.getByText("Ingresa la unidad (por ejemplo kg o cm).")).toBeVisible();

    await page.getByLabel("Unidad").fill("kg");
    await page.getByRole("button", { name: "Crear caracter├¡stica", exact: true }).click();
    await expect(page.getByRole("status", { name: "Caracter├¡stica creada" })).toContainText("Peso de demostraci├│n");
  });

  test("S03 mantiene el tipo inmutable y conserva entradas ante un error de guardado", async ({
    page,
  }) => {
    await page.goto("/caracteristicas/talla/editar");
    await expect(page.getByRole("textbox", { name: "Tipo" })).toBeDisabled();
    await setCharacteristicScenario(page, { formulario: "error" });
    await page.getByLabel("Nombre").fill("Talla editada en mock");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo guardar");
    await expect(page.getByLabel("Nombre")).toHaveValue("Talla editada en mock");
    await expect(page.getByRole("textbox", { name: "Tipo" })).toHaveValue("Lista");
  });

  test("S04 renombra por ID, aplica l├¡mite de valores e impide mutar una caracter├¡stica inactiva", async ({
    page,
  }) => {
    await page.goto("/caracteristicas/color/valores");
    const row = page.locator("tbody tr", { hasText: "Negro" });
    await expect(row).toContainText("negro");
    await row.getByRole("button", { name: "Renombrar Negro" }).click();
    await page.getByLabel("Nuevo nombre de Negro").fill("Negro grafito");
    await page.getByRole("button", { name: "Guardar nombre de Negro" }).click();
    await expect(page.getByText("Negro grafito", { exact: true })).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: "Negro grafito" })).toContainText("negro");

    await page.goto("/caracteristicas/talla/valores");
    await setCharacteristicScenario(page, { valores: "lista-limite" });
    await reopenValues(page);
    await expect(page.getByText("Valores permitidos activos: 50 (m├íx. 50)")).toBeVisible();
    await page.getByLabel("Buscar valor").fill("Valor permitido 01");
    await expect(page.getByText("1 valores visibles")).toBeVisible();
    await expect(page.getByText("Valores permitidos activos: 50 (m├íx. 50)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar valor" })).toBeDisabled();

    await page.goto("/caracteristicas/temporada/valores");
    await expect(page.getByRole("status", { name: "Caracter├¡stica inactiva" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar valor" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Renombrar Invierno" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Solicitar baja de Invierno" })).toBeDisabled();
  });

  test("S04 diferencia valores vac├¡os y error de lectura con reintento", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/caracteristicas/talla/valores");
    await setCharacteristicScenario(page, { valores: "empty" });
    await reopenValues(page);
    await expect(page.getByText("Sin valores permitidos", { exact: true })).toBeVisible();

    await setCharacteristicScenario(page, { valores: "error" });
    await reopenValues(page);
    await expect(page.getByRole("alert")).toContainText("No se pudieron cargar los valores");
    await resetCharacteristicMock(page);
    await page.getByRole("button", { name: "Volver a intentar" }).click();
    await expect(page.getByText("XS", { exact: true })).toBeVisible();
  });

  test("S06 presenta error de lectura y reintenta la consulta de detalle", async ({ page }) => {
    await page.goto("/caracteristicas/color");
    await setCharacteristicScenario(page, { catalogo: "error" });
    await page.getByRole("button", { name: "Volver al listado" }).click();
    await page.getByRole("button", { name: "Ver detalle de Color" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo cargar la caracter├¡stica");

    await setCharacteristicScenario(page, { catalogo: "default" });
    await page.getByRole("button", { name: "Reintentar consulta" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Color" })).toBeVisible();
    await expect(page.getByText("negro", { exact: true })).toBeVisible();
  });

  test("S04-P mantiene la admisi├│n, representa pending prolongado y no confirma una baja sin resultado", async ({
    page,
  }) => {
    await page.goto("/caracteristicas/color/valores");
    await setCharacteristicScenario(page, { baja: "pendiente-prolongado" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    const pending = page.getByRole("status", { name: /Solicitud de baja admitida/ });
    await expect(pending).toContainText("Solicitud de baja admitida");
    await expect(page.locator("tbody tr", { hasText: "Negro" })).toContainText("Comprobando uso");
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(pending).toContainText("La comprobaci├│n sigue pendiente");
    await expect(page.locator("tbody tr", { hasText: "Negro" })).toContainText("Comprobando uso");
  });

  test("S04-P conserva el valor ante error/no concluyente y S04-R conserva uso activo", async ({
    page,
  }) => {
    await page.goto("/caracteristicas/color/valores");
    await setCharacteristicScenario(page, { baja: "error-consulta" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo consultar el resultado");
    await expect(page.locator("tbody tr", { hasText: "Negro" })).toContainText("Activo");
    await page.getByRole("button", { name: "Cerrar" }).click();

    await setCharacteristicScenario(page, { baja: "no-concluyente" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(
      page.getByRole("status", { name: "Verificaci├│n no concluyente" }),
    ).toContainText("No pudimos confirmar");
    await expect(page.locator("tbody tr", { hasText: "Negro" })).toContainText("Activo");
    await page.getByRole("button", { name: "Entendido" }).click();

    await setCharacteristicScenario(page, { baja: "rechazada-asincrona" });
    await page.getByRole("button", { name: "Solicitar baja de Negro" }).click();
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByRole("alert")).toContainText("No se pudo dar de baja el valor");
    await expect(page.locator("tbody tr", { hasText: "Negro" })).toContainText("Activo");
  });

  test("S05 conserva el identificador al desactivar/reactivar y S06 muestra IDs estables", async ({
    page,
  }) => {
    await page.goto("/caracteristicas/material/estado");
    await page.getByRole("button", { name: "Desactivar caracter├¡stica" }).click();
    await expect(page.getByRole("status", { name: "Estado actualizado" })).toContainText("Inactivo");
    await page.getByRole("button", { name: "Ver detalle" }).click();
    await expect(page.getByText("material", { exact: true })).toBeVisible();
    await expect(page.getByText("Inactivo", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Cambiar estado" }).click();
    await page.getByRole("button", { name: "Activar caracter├¡stica" }).click();
    await expect(page.getByRole("status", { name: "Estado actualizado" })).toContainText("Activo");
    await page.getByRole("button", { name: "Ver detalle" }).click();
    await expect(page.getByText("material", { exact: true })).toBeVisible();

    await page.goto("/caracteristicas/color");
    await expect(page.getByText("color", { exact: true })).toBeVisible();
    await expect(page.getByText("negro", { exact: true })).toBeVisible();
    await expect(page.getByText("Negro", { exact: true })).toBeVisible();
  });
});
