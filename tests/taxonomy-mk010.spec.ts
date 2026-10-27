import { expect, test } from "@playwright/test";
import { productTypeService } from "../src/features/taxonomy/services/productTypeService";
import { characteristicService } from "../src/features/taxonomy/services/characteristicService";
import { __resetProductTypeStore } from "../src/features/taxonomy/adapters/mockProductTypeAdapter";
import { __resetCharacteristicStore } from "../src/features/taxonomy/adapters/mockCharacteristicAdapter";

test.describe("MK-010 Tipos de producto y esquemas de caracteristicas", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(() => {
    __resetProductTypeStore();
    __resetCharacteristicStore();
  });

  test.afterEach(() => {
    __resetProductTypeStore();
    __resetCharacteristicStore();
  });

  test("CA-01 y CA-07: asocia caracteristica activa indicando condicion e incrementa schema_version", async () => {
    const tipo = await productTypeService.crear({ nombre: "Zapatilla Trail QA" });
    expect(tipo.schemaVersion).toBe(0);

    const asociado = await productTypeService.asociarCaracteristica({
      tipoProductoId: tipo.tipoProductoId,
      caracteristicaId: "talla",
      obligatoria: true,
    });

    expect(asociado).not.toBeNull();
    expect(asociado?.schemaVersion).toBe(1);
    expect(asociado?.caracteristicasAsignadas).toBe(1);
    expect(asociado?.asociadas[0]?.caracteristicaId).toBe("talla");
    expect(asociado?.asociadas[0]?.obligatoria).toBe(true);
  });

  test("CA-02: rechaza asociacion duplicada (409 ASOCIACION_DUPLICADA)", async () => {
    const tipo = await productTypeService.crear({ nombre: "Calzado Duplicado QA" });
    await productTypeService.asociarCaracteristica({
      tipoProductoId: tipo.tipoProductoId,
      caracteristicaId: "color",
      obligatoria: false,
    });

    await expect(
      productTypeService.asociarCaracteristica({
        tipoProductoId: tipo.tipoProductoId,
        caracteristicaId: "color",
        obligatoria: true,
      }),
    ).rejects.toThrow("ASOCIACION_DUPLICADA");
  });

  test("CA-03: rechaza asociacion cuando se supera MAX_PRODUCT_TYPE_ATTRIBUTES (20)", async () => {
    test.setTimeout(30000);
    const tipo = await productTypeService.crear({ nombre: "Tipo Limite QA" });
    // Asociar 20 caracteristicas
    for (let i = 1; i <= 20; i++) {
      const c = await characteristicService.crear({
        nombre: `Caract Extra QA ${i}`,
        tipo: "TEXTO",
        estado: "Activo",
      });
      await productTypeService.asociarCaracteristica({
        tipoProductoId: tipo.tipoProductoId,
        caracteristicaId: c.id,
        obligatoria: false,
      });
    }

    const c21 = await characteristicService.crear({
      nombre: "Caract 21 Rebasada QA",
      tipo: "TEXTO",
      estado: "Activo",
    });

    await expect(
      productTypeService.asociarCaracteristica({
        tipoProductoId: tipo.tipoProductoId,
        caracteristicaId: c21.id,
        obligatoria: false,
      }),
    ).rejects.toThrow(/l.mite/i);
  });

  test("CA-04: consulta de esquema sin asociaciones devuelve lista vacia", async () => {
    const detalle = await productTypeService.obtener("accesorios");
    expect(detalle).not.toBeNull();
    expect(detalle?.asociadas).toEqual([]);
    expect(detalle?.caracteristicasAsignadas).toBe(0);
    expect(detalle?.limiteCaracteristicas).toBe(20);
  });

  test("captura evidencias visuales de pantallas MK-010 a 1440 x 900", async ({ page }) => {
    test.setTimeout(60000);

    // S01: Listado
    await page.goto("/tipos-producto");
    await expect(page.getByRole("heading", { level: 1, name: "Tipos de producto" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s01-1440.png" });

    // S01-N: Nuevo tipo de producto
    await page.goto("/tipos-producto/nuevo");
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo tipo de producto" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s01-n-1440.png" });

    // S02: Detalle y esquema
    await page.goto("/tipos-producto/calzado");
    await expect(page.getByRole("heading", { level: 1, name: "Calzado deportivo" })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s02-1440.png" });

    // S03: Asociar caracteristica
    await page.goto("/tipos-producto/accesorios/asociar");
    await expect(page.getByRole("heading", { level: 1, name: /Asociar caracter/i })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s03-1440.png" });

    // S04: Desasociar caracteristica confirmacion
    await page.goto("/tipos-producto/calzado");
    const tallaRow = page.locator("tbody tr", { hasText: "Talla" }).first();
    await tallaRow.getByRole("button", { name: "Desasociar" }).click();
    await expect(page.getByRole("dialog", { name: /Desasociar caracter/i })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s04-1440.png" });

    // S02-P: Operacion en verificacion (202 admitida)
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Desasociaci.n admitida/i })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s02-p-1440.png" });

    // Confirmar la operacion
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Desasociaci.n confirmada/i })).toBeVisible();

    // S05: Confirmar desactivacion
    await page.goto("/tipos-producto/ropa");
    await page.getByRole("button", { name: "Desactivar tipo" }).click();
    await expect(page.getByRole("dialog", { name: /Desactivar tipo de producto/i })).toBeVisible();
    await page.screenshot({ path: "docs/evidencias/mk-010-s05-1440.png" });

    // S02-R: Rechazo de desactivacion por uso activo (ej. calzado)
    await page.goto("/tipos-producto/calzado");
    await page.getByRole("button", { name: "Desactivar tipo" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("alert")).toContainText(/No se realiz. la desactivaci.n/i);
    await page.screenshot({ path: "docs/evidencias/mk-010-s02-r-1440.png" });
  });
});