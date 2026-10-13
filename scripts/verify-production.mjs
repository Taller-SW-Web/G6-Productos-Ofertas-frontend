import assert from "node:assert/strict";
import { chromium } from "playwright";

const mode = process.argv[2];
assert.ok(["mock", "api"].includes(mode), "Uso: node scripts/verify-production.mjs <mock|api> [baseURL]");
const baseURL = process.argv[3] || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));
try {
  // Loop grueso: cubre las rutas de listado y entrada de cada módulo, más los
  // estados loading/forbidden que el navegador no puede reproducir por URL y
  // obligan a simular con query params en los adapters de revisión.
  for (const path of [
    "/precios",
    "/cupones",
    "/promociones",
    "/recomendaciones",
  ]) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=loading");
    if (mode === "api") {
      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.match(
        await alert.innerText(),
        /adapter API de Pricing no está configurado|Integración API no disponible/,
      );
      assert.equal(await page.getByRole("table").count(), 0);
      if (path === "/precios") {
        assert.equal(await page.getByRole("button", { name: /Volver a cargar productos y SKU/ }).count(), 1);
        await page.getByRole("button", { name: /Volver a cargar productos y SKU/ }).click();
      }
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("combobox", { name: /Escenario/ }).count(), 0);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  // Cover nested editors, selectors and state dialogs as well as the four lists.
  for (const path of [
    "/cupones/nuevo",
    "/cupones/run10/editar",
    "/cupones/run10",
    "/cupones/run10/limites",
    "/cupones/run10/estado",
    "/promociones/nueva",
    "/promociones/carrera/editar",
    "/promociones/nueva/alcance",
    "/promociones/carrera",
    "/promociones/carrera/estado",
    "/recomendaciones/nueva/venta-cruzada",
    "/recomendaciones/mejora-rendimiento/editar",
    "/recomendaciones/nueva/upselling",
    "/recomendaciones/nueva/venta-cruzada/productos",
    "/recomendaciones/mejora-rendimiento",
    "/recomendaciones/mejora-rendimiento/estado",
  ]) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=forbidden");
    if (mode === "api") {
      await page.getByRole("alert").waitFor();
      assert.match(
        await page.getByRole("alert").innerText(),
        /Integración API no disponible/,
      );
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostración", { exact: true }).count(), 0);
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      if (path.endsWith("/estado")) await page.getByRole("dialog").waitFor();
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  // Taxonomía (MK-008 a MK-012): las secciones y rutas internas representativas.
  // En modo mock cada ruta debe estar operativa y con aviso de demostración; en
  // modo api el gate debe bloquear con el mensaje exacto y sin formularios,
  // tablas, diálogos ni aviso de demo (prohibido el fallback silencioso).
  const taxonomyPaths = [
    { path: "/categorias", table: true, form: false },
    { path: "/categorias/nueva", table: false, form: true },
    { path: "/categorias/calzado/desactivar", table: false, form: false },
    { path: "/caracteristicas", table: true, form: false },
    { path: "/caracteristicas/talla/valores", table: true, form: false },
    { path: "/tipos-producto", table: true, form: false },
    { path: "/tipos-producto/ropa", table: true, form: false },
    { path: "/marcas", table: true, form: false },
    { path: "/marcas/nike/editar", table: false, form: true },
    { path: "/seo", table: true, form: false },
    { path: "/seo/cat-ropa", table: false, form: true },
  ];
  for (const { path, table, form } of taxonomyPaths) {
    await page.goto(baseURL + path + "?modoRevision=1&escenario=loading");
    if (mode === "api") {
      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.match(
        await alert.innerText(),
        /Integración con API real no disponible actualmente para el módulo de Taxonomía/,
      );
      assert.equal(await page.getByRole("table").count(), 0);
      assert.equal(await page.locator("main form").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByText("Datos de demostración", { exact: true }).count(), 0);
    } else {
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (table) await page.getByRole("table").waitFor();
      if (form) await page.locator("main form").waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      assert.equal(await page.getByText("Datos de demostración", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("combobox", { name: /Escenario/ }).count(), 0);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  if (mode === "api")
    assert.equal(
      requests.some((url) =>
        /createDemoPricingRuntime|mock[A-Z]|\/prices-|\/catalogChoices-|\/promotionServices-|\/PromotionDataNotice-|\/(?:Coupon|Campaign|Recommendation)[^/]*Page-|\/features\/taxonomy\//.test(
          url,
        ),
      ),
      false,
    );
  assert.deepEqual(errors, []);
  const totalViews = 4 + 16 + taxonomyPaths.length;
  console.log(
    `PASS producción ${mode}: ${totalViews} vistas de Promotions, Pricing S01 y Taxonomía, 1440 px, sin errores; ${mode === "api" ? "providers ausentes explícitos, reintento, taxonomía bloqueada y cero carga de mocks" : "módulos presentes y controles de revisión ausentes"}.`,
  );
} finally {
  await browser.close();
}